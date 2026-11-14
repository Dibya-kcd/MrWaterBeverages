import GstRegistrationCard from './GstRegistrationCard';
import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  ChevronDown,
  X,
  Plus,
  Save,
  Trash2,
  Database,
  Eye,
  Sliders,
  RotateCcw,
  Download,
  Upload,
  RefreshCw,
  Cloud,
  Building2,
  Receipt,
  Users,
  ShieldCheck,
  SunMoon,
  AlertTriangle,
  CreditCard,
  Truck,
  Warehouse as WarehouseIcon,
  Pencil,
  Key,
  LogOut,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { BeatsSettings } from './BeatsSettings';
import { LoginPageEditor } from './LoginPageEditor';
import { UserAvatar, useAvatarId } from '../common/UserAvatar';
import { AVATAR_IDS, writeAvatar } from '../../utils/avatar';
import { FontSize, GstMode, PriceType, StickyTotalPosition, Salesman } from '../../types';
import { validateOrgProfile, summarizeErrors, normalizeGstin } from '../../utils/validation';
import { ToggleSwitch } from '../ui/ToggleSwitch';

const INDIAN_STATES = [
  '27 Maharashtra',
  '24 Gujarat',
  '29 Karnataka',
  '07 Delhi',
  '36 Telangana',
  '33 Tamil Nadu',
  '09 Uttar Pradesh',
  '19 West Bengal',
  '23 Madhya Pradesh',
  '08 Rajasthan',
  '21 Odisha',
  '03 Punjab',
  '06 Haryana',
  '32 Kerala',
  '10 Bihar',
  '37 Andhra Pradesh',
];

type SettingsSection = 'business' | 'billing' | 'fleet' | 'beats' | 'staff' | 'display' | 'login' | 'cloud' | 'backups';

export const SettingsView: React.FC<{ initialSection?: SettingsSection | 'warehouses' }> = ({ initialSection }) => {
  const {
    orgProfile,
    updateOrgProfile,
    pullOrgProfileFromCloud,
    billingSettings,
    updateBillingSettings,
    pullBillingSettingsFromCloud,
    warehouses,
    addWarehouse,
    deleteWarehouse,
    salesmen,
    addSalesman,
    updateSalesman,
    deleteSalesman,
    toggleSalesmanActive,
    currentUser,
    trips,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    lowVisionMode,
    toggleLowVisionMode,
    lowVisionStickyPosition,
    setLowVisionStickyPosition,
    supabaseConfig,
    supabaseStatus,
    checkSupabaseConnection,
    syncToCloud,
    pullFromCloud,
    exportBackup,
    importBackup,
    cleanDatabase,
    clearTransactions,
    resetToDefault,
    logout,
  } = useLedger();
  const avatarId = useAvatarId();

  const { t } = useLanguage();

  // Active section filter for navigation (default: business)
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    // Godowns are managed under the 'fleet' section (Warehouses & Vehicles).
    initialSection === 'warehouses' ? 'fleet' : initialSection || 'business',
  );

  // Edit Staff Modal State
  const [editingStaff, setEditingStaff] = useState<Salesman | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffVehicle, setEditStaffVehicle] = useState('');
  const [editStaffActive, setEditStaffActive] = useState(true);
  const [editStaffNewPin, setEditStaffNewPin] = useState('');
  const [editStaffError, setEditStaffError] = useState<string | null>(null);
  const [isStaffSubmitting, setIsStaffSubmitting] = useState(false);

  // Dedicated In-App Set PIN Modal State
  const [pinModalStaff, setPinModalStaff] = useState<Salesman | null>(null);
  const [targetPin, setTargetPin] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);

  // Delete Staff Modal State
  const [deletingStaff, setDeletingStaff] = useState<Salesman | null>(null);

  // Real Database Business Profile Form State (synced from orgProfile)
  const [profileForm, setProfileForm] = useState({
    name: orgProfile.name || '',
    tagline: orgProfile.tagline || '',
    ownerName: orgProfile.ownerName || '',
    phone: orgProfile.phone || '',
    email: orgProfile.email || '',
    address: orgProfile.address || '',
    city: orgProfile.city || '',
    state: orgProfile.state || '27 Maharashtra',
    stateCode: orgProfile.stateCode || '27',
    gstin: orgProfile.gstin || '',
    pan: orgProfile.gstin && orgProfile.gstin.length >= 12 ? orgProfile.gstin.slice(2, 12) : '',
    fssai: orgProfile.fssai || '',
    bankName: orgProfile.bankName || '',
    accountNumber: orgProfile.accountNumber || '',
    ifsc: orgProfile.ifsc || '',
    upiId: orgProfile.upiId || '',
    invoiceTerms: orgProfile.invoiceTerms || '',
  });

  // Real Database Billing Settings Form State (synced from billingSettings)
  const [billingForm, setBillingForm] = useState({
    printLayout: 'A4',
    creditLimitCrossed: 'Warn',
    expiryAlertDays: 60,
    sellEarliestExpiryFirst: true,
    allowSellingWithoutStock: false,
    invoicePrefix: billingSettings.invoicePrefix || 'INV',
    defaultSaleType: billingSettings.defaultSaleType || ('Retail' as PriceType),
    defaultGstMode: billingSettings.defaultGstMode || ('inclusive' as GstMode),
    lowStockThreshold: billingSettings.lowStockThreshold || 5,
    maxSalesmanDiscountPercent: billingSettings.maxSalesmanDiscountPercent ?? 10,
    roundOffGrandTotal: billingSettings.roundOffGrandTotal ?? true,
    showBatchOnInvoice: billingSettings.showBatchOnInvoice ?? false,
    gstOnFreeCases: billingSettings.gstOnFreeCases !== false,
    schemesEnabled: billingSettings.schemesEnabled !== false,
    autoApplyPromotions: billingSettings.autoApplyPromotions ?? true,
    showUpiQrOnReceipt: billingSettings.showUpiQrOnReceipt ?? true,
    showOdiaNameOnReceipt: billingSettings.showOdiaNameOnReceipt ?? false,
    defaultInvoicePaper: (billingSettings.defaultInvoicePaper === '80mm' ? '80mm' : 'a4') as 'a4' | '80mm',
    whatsappTextStyle: (billingSettings.whatsappTextStyle === 'receipt' ? 'receipt' : 'detailed') as 'detailed' | 'receipt',
    receiptTextWidth: (billingSettings.receiptTextWidth === 42 || billingSettings.receiptTextWidth === 48
      ? billingSettings.receiptTextWidth
      : 32) as 32 | 42 | 48,
  });

  // Keep forms in sync whenever database record changes
  useEffect(() => {
    setProfileForm({
      name: orgProfile.name || '',
      tagline: orgProfile.tagline || '',
      ownerName: orgProfile.ownerName || '',
      phone: orgProfile.phone || '',
      email: orgProfile.email || '',
      address: orgProfile.address || '',
      city: orgProfile.city || '',
      state: orgProfile.state || '27 Maharashtra',
      stateCode: orgProfile.stateCode || '27',
      gstin: orgProfile.gstin || '',
      pan: orgProfile.gstin && orgProfile.gstin.length >= 12 ? orgProfile.gstin.slice(2, 12) : '',
      fssai: orgProfile.fssai || '',
      bankName: orgProfile.bankName || '',
      accountNumber: orgProfile.accountNumber || '',
      ifsc: orgProfile.ifsc || '',
      upiId: orgProfile.upiId || '',
      invoiceTerms: orgProfile.invoiceTerms || '',
    });
  }, [orgProfile]);

  useEffect(() => {
    setBillingForm((prev) => ({
      ...prev,
      invoicePrefix: billingSettings.invoicePrefix || 'INV',
      defaultSaleType: billingSettings.defaultSaleType || 'Retail',
      defaultGstMode: billingSettings.defaultGstMode || 'inclusive',
      lowStockThreshold: billingSettings.lowStockThreshold || 5,
      maxSalesmanDiscountPercent: billingSettings.maxSalesmanDiscountPercent ?? 10,
      roundOffGrandTotal: billingSettings.roundOffGrandTotal ?? true,
      showBatchOnInvoice: billingSettings.showBatchOnInvoice ?? false,
      gstOnFreeCases: billingSettings.gstOnFreeCases !== false,
      schemesEnabled: billingSettings.schemesEnabled !== false,
      autoApplyPromotions: billingSettings.autoApplyPromotions ?? true,
      showUpiQrOnReceipt: billingSettings.showUpiQrOnReceipt ?? true,
      showOdiaNameOnReceipt: billingSettings.showOdiaNameOnReceipt ?? false,
      defaultInvoicePaper: billingSettings.defaultInvoicePaper === '80mm' ? '80mm' : 'a4',
      whatsappTextStyle: billingSettings.whatsappTextStyle === 'receipt' ? 'receipt' : 'detailed',
      receiptTextWidth:
        billingSettings.receiptTextWidth === 42 || billingSettings.receiptTextWidth === 48
          ? billingSettings.receiptTextWidth
          : 32,
    }));
  }, [billingSettings]);

  // Loading & Feedback states
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Warehouse Form State
  const [newWhName, setNewWhName] = useState('');
  const [newWhType, setNewWhType] = useState<'vehicle' | 'warehouse'>('vehicle');
  const [newWhRegNo, setNewWhRegNo] = useState('');

  // New Staff Form State
  const [newStaffIdentifier, setNewStaffIdentifier] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'driver' | 'salesman' | 'manager' | 'accountant' | 'admin'>('driver');
  const [newStaffPin, setNewStaffPin] = useState('');

  // Derive distinct vehicles from database trips and salesmen
  const existingVehicles = Array.from(
    new Set([
      ...trips.map((t) => t.vehicle).filter(Boolean),
      ...salesmen.map((s) => s.defaultVehicle).filter(Boolean),
    ])
  ) as string[];

  // Save Settings directly to Supabase cloud and local database
  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);

    const validationErrors = validateOrgProfile({
      name: profileForm.name,
      phone: profileForm.phone,
      email: profileForm.email,
      gstin: profileForm.gstin,
    });

    if (Object.keys(validationErrors).length > 0) {
      setToastMessage(summarizeErrors(validationErrors));
      setIsSaving(false);
      return;
    }

    try {
      const normalizedGstinVal = profileForm.gstin ? normalizeGstin(profileForm.gstin) : profileForm.gstin;

      const profileRes = await updateOrgProfile({
        name: profileForm.name,
        tagline: profileForm.tagline,
        ownerName: profileForm.ownerName,
        phone: profileForm.phone,
        email: profileForm.email,
        address: profileForm.address,
        city: profileForm.city,
        state: profileForm.state,
        stateCode: profileForm.state.slice(0, 2),
        gstin: normalizedGstinVal,
        fssai: profileForm.fssai,
        bankName: profileForm.bankName,
        accountNumber: profileForm.accountNumber,
        ifsc: profileForm.ifsc,
        upiId: profileForm.upiId,
        invoiceTerms: profileForm.invoiceTerms,
      });

      const billingRes = await updateBillingSettings({
        invoicePrefix: billingForm.invoicePrefix,
        defaultSaleType: billingForm.defaultSaleType,
        defaultGstMode: billingForm.defaultGstMode,
        lowStockThreshold: billingForm.lowStockThreshold,
        maxSalesmanDiscountPercent: billingForm.maxSalesmanDiscountPercent,
        roundOffGrandTotal: billingForm.roundOffGrandTotal,
        showBatchOnInvoice: billingForm.showBatchOnInvoice,
        gstOnFreeCases: billingForm.gstOnFreeCases,
        schemesEnabled: billingForm.schemesEnabled,
        autoApplyPromotions: billingForm.autoApplyPromotions,
        showUpiQrOnReceipt: billingForm.showUpiQrOnReceipt,
        showOdiaNameOnReceipt: billingForm.showOdiaNameOnReceipt,
        defaultInvoicePaper: billingForm.defaultInvoicePaper,
        whatsappTextStyle: billingForm.whatsappTextStyle,
        receiptTextWidth: billingForm.receiptTextWidth,
      });

      if (profileRes.cloudSynced && billingRes.cloudSynced) {
        setToastMessage('Settings saved locally & synchronized to Supabase PostgreSQL cloud!');
      } else {
        setToastMessage('Settings saved successfully!');
      }
    } catch (err: any) {
      setToastMessage(`Saved locally (${err?.message || 'Offline mode'}).`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Pull fresh settings from Supabase Cloud Database
  const handlePullCloud = async () => {
    setIsPulling(true);
    try {
      const pRes = await pullOrgProfileFromCloud();
      const bRes = await pullBillingSettingsFromCloud();
      if (pRes.success || bRes.success) {
        setToastMessage('Refreshed latest settings from Supabase cloud database!');
      } else {
        setToastMessage('Supabase cloud: No remote changes found or already up to date.');
      }
    } catch (err: any) {
      setToastMessage(`Pull notice: ${err?.message || 'Offline'}`);
    } finally {
      setIsPulling(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Add Warehouse or Vehicle directly to database
  const handleAddWarehouseOrVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;

    if (newWhType === 'warehouse') {
      const code = 'WH-' + newWhName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
      addWarehouse({
        name: newWhName.trim(),
        code,
        location: profileForm.city || 'Main Depot',
        manager: profileForm.ownerName || 'Depot Manager',
        phone: profileForm.phone || '',
        isDefault: warehouses.length === 0,
      });
      setToastMessage(`Warehouse "${newWhName.trim()}" created in database.`);
    } else {
      // Vehicle: add vehicle to the fleet
      const vehicleLabel = newWhRegNo ? `${newWhName.trim()} (${newWhRegNo.trim().toUpperCase()})` : newWhName.trim();
      addWarehouse({
        name: vehicleLabel,
        code: 'VEH-' + Math.floor(Math.random() * 900 + 100),
        location: 'Mobile Delivery Van',
        manager: 'Driver',
        phone: '',
        isDefault: false,
        notes: `Vehicle Registration: ${newWhRegNo.trim().toUpperCase()}`,
      });
      setToastMessage(`Vehicle "${vehicleLabel}" added to distribution fleet.`);
    }

    setNewWhName('');
    setNewWhRegNo('');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Add Staff Member directly to database
  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffIdentifier.trim()) return;

    const identifier = newStaffIdentifier.trim();
    const isEmail = identifier.includes('@');
    const name = isEmail ? identifier.split('@')[0] : identifier;
    const phone = isEmail ? '9' + Math.floor(100000000 + Math.random() * 900000000) : identifier;

    // A real PIN is required: the old form silently gave everyone 1234.
    if (!/^\d{4,6}$/.test(newStaffPin)) {
      setToastMessage('Enter a 4 to 6 digit PIN for this staff member (6 digits is safer).');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    const res = await addSalesman(
      {
        name,
        phone,
        active: true,
        defaultVehicle: existingVehicles[0] || 'Van 1',
      },
      newStaffPin
    );

    if (res.success) {
      setToastMessage(`${name} added. They sign in on the salesman login with phone ${phone} and the PIN you set.`);
      setNewStaffIdentifier('');
      setNewStaffPin('');
    } else {
      setToastMessage(res.error || 'Failed to add staff member.');
    }
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Open Edit Staff Modal
  const handleOpenEditStaff = (staff: Salesman) => {
    setEditingStaff(staff);
    setEditStaffName(staff.name || '');
    setEditStaffPhone(staff.phone || '');
    setEditStaffVehicle(staff.defaultVehicle || staff.default_vehicle || '');
    setEditStaffActive(staff.active !== false);
    setEditStaffNewPin('');
    setEditStaffError(null);
  };

  // Save Edit Staff Details
  const handleSaveEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    if (!editStaffName.trim()) {
      setEditStaffError('Staff name is required.');
      return;
    }
    if (!editStaffPhone.trim()) {
      setEditStaffError('Phone number / login identifier is required.');
      return;
    }
    if (editStaffNewPin.trim() && !/^\d{4,6}$/.test(editStaffNewPin.trim())) {
      setEditStaffError('PIN must be 4 to 6 numeric digits.');
      return;
    }

    setIsStaffSubmitting(true);
    setEditStaffError(null);
    try {
      const res = await updateSalesman(
        editingStaff.id,
        {
          name: editStaffName.trim(),
          phone: editStaffPhone.trim(),
          defaultVehicle: editStaffVehicle.trim(),
          active: editStaffActive,
        },
        editStaffNewPin.trim() ? editStaffNewPin.trim() : undefined
      );

      if (res.success) {
        setToastMessage(`Staff details updated for ${editStaffName.trim()}.`);
        setEditingStaff(null);
      } else {
        setEditStaffError(res.error || 'Failed to update staff member.');
      }
    } catch (err: any) {
      setEditStaffError(err?.message || 'Error updating staff details.');
    } finally {
      setIsStaffSubmitting(false);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Open Dedicated Set PIN Modal
  const handleOpenSetPin = (staff: Salesman) => {
    setPinModalStaff(staff);
    setTargetPin('');
    setPinModalError(null);
  };

  // Save New Security PIN
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalStaff) return;
    const cleanPin = targetPin.trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      setPinModalError('PIN must be 4 to 6 numeric digits.');
      return;
    }

    setIsPinSubmitting(true);
    setPinModalError(null);
    try {
      const res = await updateSalesman(pinModalStaff.id, {}, cleanPin);
      if (res.success) {
        setToastMessage(`PIN updated successfully for ${pinModalStaff.name}.`);
        setPinModalStaff(null);
      } else {
        setPinModalError(res.error || 'Could not update PIN.');
      }
    } catch (err: any) {
      setPinModalError(err?.message || 'Error updating PIN.');
    } finally {
      setIsPinSubmitting(false);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Confirm delete staff
  const handleConfirmDeleteStaff = async () => {
    if (!deletingStaff) return;
    try {
      await deleteSalesman(deletingStaff.id);
      setToastMessage(`${deletingStaff.name} removed from staff.`);
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to remove staff.');
    } finally {
      setDeletingStaff(null);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Restore backup file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importBackup(content);
      if (res.success) {
        setToastMessage('Backup restored successfully! Refreshing...');
        setTimeout(() => window.location.reload(), 900);
      } else {
        setToastMessage(res.error || 'Failed to import backup file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div id="view-settings" className="hh-view w-full min-w-0 text-neutral-900 font-sans">
      <div className="w-full space-y-3 sm:space-y-5">
        {/* Page Header */}
        <div className="hh-pagehead">
          <h1>Settings</h1>
          <p className="hidden sm:block">Business, GST, billing rules, staff</p>
        </div>

        {/* Success Toast */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 bg-[var(--primary)] text-white px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Segmented Filter Tabs */}
        <div className="hh-tabstrip flex items-center gap-1.5 overflow-x-auto pb-1 text-xs -mx-2.5 px-2.5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'business' as const, label: t('settings.section.business') },
            { id: 'billing' as const, label: t('settings.section.billing') },
            { id: 'fleet' as const, label: t('settings.section.fleet') },
            ...(currentUser?.role === 'admin' ? [{ id: 'beats' as const, label: t('settings.section.beats') }] : []),
            { id: 'staff' as const, label: t('settings.section.staff') },
            { id: 'display' as const, label: t('settings.section.display') },
            ...(currentUser?.role === 'admin' ? [{ id: 'login' as const, label: 'Login page' }] : []),
            { id: 'cloud' as const, label: t('settings.section.cloud') },
            { id: 'backups' as const, label: t('settings.section.backups') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-xl font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeSection === tab.id
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* CARD 1: BUSINESS (ORGANISATION PROFILE)                                  */}
        {/* ========================================================================= */}
        {activeSection === 'business' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-5">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Business</h2>
              <span className="hidden sm:inline text-xs text-neutral-400">Organisation & Tax Profile</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3 sm:gap-y-4">
              {/* BUSINESS NAME */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  BUSINESS NAME
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Shree Beverages Distributors"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* GSTIN */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  GSTIN
                </label>
                <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  type="text"
                  maxLength={15}
                  value={profileForm.gstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setProfileForm({
                      ...profileForm,
                      gstin: val,
                      pan: val.length >= 12 ? val.slice(2, 12) : profileForm.pan,
                    });
                  }}
                  placeholder="27AAKCS1234F1Z5"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 uppercase placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* PAN */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  PAN
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={profileForm.pan}
                  onChange={(e) => setProfileForm({ ...profileForm, pan: e.target.value.toUpperCase() })}
                  placeholder="AAKCS1234F"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 uppercase placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* FSSAI LICENCE */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  FSSAI LICENCE
                </label>
                <input
                  type="text"
                  maxLength={14}
                  value={profileForm.fssai}
                  onChange={(e) => setProfileForm({ ...profileForm, fssai: e.target.value })}
                  placeholder="11521034000123"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* PHONE */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  PHONE
                </label>
                <input inputMode="tel" autoComplete="tel"
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="9822012345"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* EMAIL */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  EMAIL
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder="sales@shreebeverages.com"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* STATE */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  STATE
                </label>
                <div className="relative">
                  <select
                    value={profileForm.state}
                    onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs cursor-pointer"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* ADDRESS */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  ADDRESS
                </label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  placeholder="Plot 14, MIDC Bhosari, Pune 411026"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* CITY & PROPRIETOR (FULL CAPABILITY) */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  CITY & REGION
                </label>
                <input
                  type="text"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  placeholder="Pune, Maharashtra"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  PROPRIETOR / AUTHORIZED SIGNATORY
                </label>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => setProfileForm({ ...profileForm, ownerName: e.target.value })}
                  placeholder="Proprietor / Signatory Name"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* BANK */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  BANK
                </label>
                <input
                  type="text"
                  value={profileForm.bankName}
                  onChange={(e) => setProfileForm({ ...profileForm, bankName: e.target.value })}
                  placeholder="HDFC Bank"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* ACCOUNT NO. */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  ACCOUNT NO.
                </label>
                <input
                  type="text"
                  value={profileForm.accountNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, accountNumber: e.target.value })}
                  placeholder="50200012345678"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* IFSC */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  IFSC
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={profileForm.ifsc}
                  onChange={(e) => setProfileForm({ ...profileForm, ifsc: e.target.value.toUpperCase() })}
                  placeholder="HDFC0001234"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 uppercase placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* UPI ID */}
              <div>
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  UPI ID
                </label>
                <input
                  type="text"
                  value={profileForm.upiId}
                  onChange={(e) => setProfileForm({ ...profileForm, upiId: e.target.value })}
                  placeholder="shreebev@upi"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>

              {/* INVOICE TERMS */}
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                  INVOICE TERMS
                </label>
                <input
                  type="text"
                  value={profileForm.invoiceTerms}
                  onChange={(e) => setProfileForm({ ...profileForm, invoiceTerms: e.target.value })}
                  placeholder="Goods once sold will not be taken back except expiry/damage. Interest @18% after due date."
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 2: BILLING RULES & INVOICING PREFERENCES                            */}
        {/* ========================================================================= */}
        {activeSection === 'billing' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-5">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Billing rules</h2>
              <span className="hidden sm:inline text-xs text-neutral-400">Invoicing, Taxes & Limits</span>
            </div>

            <div className="space-y-4">
              {/* ROW 1: PRINT LAYOUT & CREDIT LIMIT CROSSED */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3 sm:gap-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    PRINT LAYOUT
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.printLayout}
                      onChange={(e) => setBillingForm({ ...billingForm, printLayout: e.target.value })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs cursor-pointer"
                    >
                      <option value="A4">A4</option>
                      <option value="Thermal 3-inch (80mm)">Thermal 3-inch (80mm)</option>
                      <option value="Half Page A5">Half Page A5</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    CREDIT LIMIT CROSSED
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.creditLimitCrossed}
                      onChange={(e) => setBillingForm({ ...billingForm, creditLimitCrossed: e.target.value })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs cursor-pointer"
                    >
                      <option value="Warn">Warn</option>
                      <option value="Block">Block billing</option>
                      <option value="Allow">Allow without warning</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* ROW 2: EXPIRY ALERT (DAYS) & SELL EARLIEST EXPIRY FIRST */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3 sm:gap-y-4 items-center">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    EXPIRY ALERT (DAYS)
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    value={billingForm.expiryAlertDays}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, expiryAlertDays: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all shadow-xs"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4 md:pt-5">
                  <ToggleSwitch
                    id="toggle-sell-earliest-expiry"
                    checked={billingForm.sellEarliestExpiryFirst}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        sellEarliestExpiryFirst: v,
                      })
                    }
                    ariaLabelledBy="label-sell-earliest-expiry"
                  />
                  <span
                    id="label-sell-earliest-expiry"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        sellEarliestExpiryFirst: !billingForm.sellEarliestExpiryFirst,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Sell earliest expiry first
                  </span>
                </div>
              </div>

              {/* ROW 3: ALLOW SELLING WITHOUT STOCK & ROUND OFF BILL TOTAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3 sm:gap-y-4 items-center pt-2">
                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    id="toggle-allow-no-stock"
                    checked={billingForm.allowSellingWithoutStock}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        allowSellingWithoutStock: v,
                      })
                    }
                    ariaLabelledBy="label-allow-no-stock"
                  />
                  <span
                    id="label-allow-no-stock"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        allowSellingWithoutStock: !billingForm.allowSellingWithoutStock,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Allow selling without stock
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    id="toggle-round-off-total"
                    checked={billingForm.roundOffGrandTotal}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        roundOffGrandTotal: v,
                      })
                    }
                    ariaLabelledBy="label-round-off-total"
                  />
                  <span
                    id="label-round-off-total"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        roundOffGrandTotal: !billingForm.roundOffGrandTotal,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Round off bill total
                  </span>
                </div>
              </div>

              {/* ADDITIONAL INVOICING PARAMETERS FROM DATABASE */}
              <div className="pt-4 border-t border-neutral-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3 sm:gap-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    INVOICE PREFIX CODE
                  </label>
                  <input
                    type="text"
                    value={billingForm.invoicePrefix}
                    onChange={(e) => setBillingForm({ ...billingForm, invoicePrefix: e.target.value.toUpperCase() })}
                    placeholder="INV"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 uppercase focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    DEFAULT SALE RATE TYPE
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.defaultSaleType}
                      onChange={(e) => setBillingForm({ ...billingForm, defaultSaleType: e.target.value as PriceType })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                    >
                      <option value="Retail">Retail (MRP / Direct Retail Rate)</option>
                      <option value="Wholesale">Wholesale (Bulk Kirana Shop Rate)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <GstRegistrationCard />

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    DEFAULT GST MODE
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.defaultGstMode}
                      onChange={(e) => setBillingForm({ ...billingForm, defaultGstMode: e.target.value as GstMode })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                    >
                      <option value="inclusive">GST Inclusive (Rate includes Tax)</option>
                      <option value="off">GST Off / Non-Tax Bill</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    MAX SALESMAN DISCOUNT CAP (%)
                  </label>
                  <input
                    type="number" inputMode="numeric"
                    min={0}
                    max={100}
                    value={billingForm.maxSalesmanDiscountPercent}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        maxSalesmanDiscountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    INVOICE PDF PAPER (DOWNLOAD / PRINT / SHARE)
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.defaultInvoicePaper}
                      onChange={(e) => setBillingForm({ ...billingForm, defaultInvoicePaper: e.target.value as 'a4' | '80mm' })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                    >
                      <option value="a4">A4 invoice (full GST layout)</option>
                      <option value="80mm">80 mm receipt (thermal slip)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">You can still switch A4 / 80 mm on each invoice's Share screen.</p>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    WHATSAPP BILL MESSAGE STYLE
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.whatsappTextStyle}
                      onChange={(e) => setBillingForm({ ...billingForm, whatsappTextStyle: e.target.value as 'detailed' | 'receipt' })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                    >
                      <option value="detailed">Detailed message (with icons)</option>
                      <option value="receipt">80 mm receipt text (fixed-width slip)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">
                    RECEIPT TEXT WIDTH (CHARACTERS PER LINE)
                  </label>
                  <div className="relative">
                    <select
                      value={billingForm.receiptTextWidth}
                      onChange={(e) => setBillingForm({ ...billingForm, receiptTextWidth: Number(e.target.value) as 32 | 42 | 48 })}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                    >
                      <option value={32}>32 - fits a phone chat (WhatsApp)</option>
                      <option value={42}>42 - 80 mm printer apps</option>
                      <option value={48}>48 - 80 mm printer apps, small font</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">Used when the message style above is the 80 mm receipt text.</p>
                </div>
              </div>

              {/* STATUTORY & SCHEME SWITCHES */}
              <div className="pt-2 border-t border-neutral-100 space-y-3.5 text-sm">
                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    id="toggle-show-batch-invoice"
                    checked={billingForm.showBatchOnInvoice}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        showBatchOnInvoice: v,
                      })
                    }
                    ariaLabelledBy="label-show-batch-invoice"
                  />
                  <span
                    id="label-show-batch-invoice"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        showBatchOnInvoice: !billingForm.showBatchOnInvoice,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Print Lot / Batch numbers & expiry dates on invoices
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <ToggleSwitch
                    id="toggle-show-upi-qr"
                    checked={billingForm.showUpiQrOnReceipt}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        showUpiQrOnReceipt: v,
                      })
                    }
                    ariaLabelledBy="label-show-upi-qr"
                    className="mt-0.5"
                  />
                  <span
                    id="label-show-upi-qr"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        showUpiQrOnReceipt: !billingForm.showUpiQrOnReceipt,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Print a UPI QR on the 80 mm receipt when money is still due
                    <span className="block text-[11px] font-normal text-neutral-500 mt-0.5">Needs your UPI ID in the organization profile. The QR opens a payment screen with the balance filled in.</span>
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <ToggleSwitch
                    id="toggle-show-odia-receipt"
                    checked={billingForm.showOdiaNameOnReceipt}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        showOdiaNameOnReceipt: v,
                      })
                    }
                    ariaLabelledBy="label-show-odia-receipt"
                    className="mt-0.5"
                  />
                  <span
                    id="label-show-odia-receipt"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        showOdiaNameOnReceipt: !billingForm.showOdiaNameOnReceipt,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Print Odia product names on the 80 mm receipt and WhatsApp receipt text
                    <span className="block text-[11px] font-normal text-neutral-500 mt-0.5">Uses the Odia name saved on each product. Products without one show the English name only.</span>
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    id="toggle-gst-free-cases"
                    checked={billingForm.gstOnFreeCases}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        gstOnFreeCases: v,
                      })
                    }
                    ariaLabelledBy="label-gst-free-cases"
                  />
                  <span
                    id="label-gst-free-cases"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        gstOnFreeCases: !billingForm.gstOnFreeCases,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Charge GST on free scheme cases too (supplier invoice method)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    id="toggle-auto-apply-schemes"
                    checked={billingForm.autoApplyPromotions}
                    onChange={(v) =>
                      setBillingForm({
                        ...billingForm,
                        autoApplyPromotions: v,
                      })
                    }
                    ariaLabelledBy="label-auto-apply-schemes"
                  />
                  <span
                    id="label-auto-apply-schemes"
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        autoApplyPromotions: !billingForm.autoApplyPromotions,
                      })
                    }
                    className="text-sm font-medium text-neutral-800 cursor-pointer select-none"
                  >
                    Auto-apply qualifying schemes by default in Billing
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SAVE SETTINGS ACTION BUTTON                  */}
        {/* ========================================================================= */}
        <div>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveAll}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-semibold py-3 px-6 rounded-xl transition-all cursor-pointer text-sm shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <span>Saving settings to database...</span> : <span>Save settings</span>}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* CARD 3: WAREHOUSES & VEHICLES (DATABASE BACKED)                          */}
        {/* ========================================================================= */}
        {activeSection === 'fleet' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Warehouses & vehicles</h2>
              <span className="text-xs text-neutral-400 font-mono">
                {warehouses.length} locations · {existingVehicles.length} vehicles
              </span>
            </div>

            {/* Live List from Database */}
            <div className="divide-y divide-neutral-200/60 mb-5">
              {warehouses.map((wh) => {
                const isVeh = wh.notes?.includes('Vehicle') || wh.location.includes('Van') || wh.name.toLowerCase().includes('van');
                return (
                  <div key={wh.id} className="py-3 flex items-center justify-between group">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-800">{wh.name}</span>
                      {wh.isDefault && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 font-semibold">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-400 font-mono">
                        {isVeh ? `vehicle ${wh.code || ''}` : 'warehouse'}
                      </span>
                      {warehouses.length > 1 && !wh.isDefault && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete ${wh.name} from database?`)) {
                              deleteWarehouse(wh.id);
                              setToastMessage(`Removed ${wh.name}`);
                              setTimeout(() => setToastMessage(null), 3000);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-600 transition-opacity p-1 cursor-pointer"
                          title="Remove from database"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Display vehicles from trips if not covered in warehouses */}
              {existingVehicles
                .filter((v) => !warehouses.some((w) => w.name.includes(v)))
                .map((vehName, idx) => (
                  <div key={'veh-' + idx} className="py-3 flex items-center justify-between group">
                    <span className="text-sm font-medium text-neutral-800">{vehName}</span>
                    <span className="text-xs text-neutral-400 font-mono">vehicle</span>
                  </div>
                ))}
            </div>

            {/* Add New Warehouse / Vehicle Form */}
            <form onSubmit={handleAddWarehouseOrVehicle} className="pt-2 border-t border-neutral-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs"
                />

                <div className="relative">
                  <select
                    value={newWhType}
                    onChange={(e) => setNewWhType(e.target.value as 'vehicle' | 'warehouse')}
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-800 appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer"
                  >
                    <option value="vehicle">Vehicle</option>
                    <option value="warehouse">Warehouse</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <input
                  type="text"
                  placeholder="Reg. no."
                  value={newWhRegNo}
                  onChange={(e) => setNewWhRegNo(e.target.value)}
                  disabled={newWhType === 'warehouse'}
                  className="bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-800 uppercase placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs disabled:bg-neutral-100 disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={!newWhName.trim()}
                className="w-full mt-3 py-2 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors cursor-pointer shadow-xs disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 4: STAFF & ROLES (DATABASE BACKED)                                  */}
        {/* ========================================================================= */}
        {activeSection === 'beats' && <BeatsSettings />}

        {activeSection === 'staff' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs">
            <h2 className="text-lg font-bold text-neutral-900 mb-1">Staff & roles</h2>
            <p className="hidden sm:block text-xs text-neutral-500 mb-4">
              Staff sign up first, then give them a role here by email.
            </p>

            {/* Verified Database Staff List */}
            <div className="divide-y divide-neutral-100 mb-5">
              {/* Authenticated Owner / Admin */}
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-neutral-900 block">
                    {currentUser?.username || profileForm.ownerName || 'dibyaprakashkcd5'}
                  </span>
                  <span className="text-xs text-neutral-400 block">
                    {currentUser && 'email' in currentUser ? currentUser.email : profileForm.email || 'dibyaprakashkcd5@gmail.com'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="bg-[#DCFCE7] text-[#166534] text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                    <span>owner</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to log out?')) {
                        if (typeof logout === 'function') logout();
                      }
                    }}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Sign out of account"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>

              {/* Database Salesmen & Staff */}
              {salesmen.map((salesman) => (
                <div key={salesman.id} className="py-2.5 flex items-center justify-between group">
                  <div>
                    <span className="text-sm font-semibold text-neutral-900 block">{salesman.name}</span>
                    <span className="text-xs text-neutral-400 font-mono block">
                      Phone / Login: {salesman.phone} {salesman.defaultVehicle ? `· ${salesman.defaultVehicle}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSalesmanActive(salesman.id)}
                      className={`text-xs font-medium px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                        salesman.active ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                      title="Toggle active status"
                    >
                      {salesman.active ? 'active' : 'inactive'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditStaff(salesman)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors flex items-center gap-1"
                      title="Edit staff details"
                    >
                      <Pencil className="w-3 h-3 text-neutral-600" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenSetPin(salesman)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                      title="Set or reset this person's login PIN"
                    >
                      <Key className="w-3 h-3 text-emerald-600" />
                      <span>Set PIN</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingStaff(salesman)}
                      className="text-neutral-400 hover:text-rose-600 p-1.5 cursor-pointer rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove staff member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Staff Member Form */}
            <form onSubmit={handleAddStaffMember} className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="staff@email.com or phone"
                value={newStaffIdentifier}
                onChange={(e) => setNewStaffIdentifier(e.target.value)}
                className="flex-1 bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs"
              />

              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="PIN (4-6 digits)"
                value={newStaffPin}
                onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full sm:w-36 bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs"
              />

              <div className="relative w-full sm:w-36">
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as any)}
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 text-sm text-neutral-800 appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] shadow-xs cursor-pointer capitalize"
                >
                  <option value="driver">driver</option>
                  <option value="salesman">salesman</option>
                  <option value="manager">manager</option>
                  <option value="accountant">accountant</option>
                  <option value="admin">admin</option>
                </select>
                <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <button
                type="submit"
                disabled={!newStaffIdentifier.trim() || newStaffPin.length < 4}
                className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer shadow-xs disabled:opacity-40"
              >
                Give
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 5: DISPLAY & ACCESSIBILITY                                          */}
        {/* ========================================================================= */}
        {activeSection === 'login' && currentUser?.role === 'admin' && <LoginPageEditor />}

        {activeSection === 'display' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">{t('settings.display.title')}</h2>
              <p className="hidden sm:block text-xs text-neutral-500 mt-0.5">
                {t('settings.display.subtitle')}
              </p>
            </div>

            {/* Font Scale Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'standard' as FontSize, title: t('settings.display.fontStandard'), desc: t('settings.display.fontStandardDesc') },
                { id: 'large' as FontSize, title: t('settings.display.fontLarge'), desc: t('settings.display.fontLargeDesc') },
                { id: 'xlarge' as FontSize, title: t('settings.display.fontXLarge'), desc: t('settings.display.fontXLargeDesc') },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFontSize(opt.id)}
                  className={`p-3.5 border rounded-xl text-left transition-all cursor-pointer ${
                    fontSize === opt.id
                      ? 'border-[var(--primary)] bg-emerald-50/50 text-[var(--primary)] ring-1 ring-[var(--primary)]'
                      : 'border-neutral-200 hover:border-neutral-300 text-neutral-700 bg-white'
                  }`}
                >
                  <div className="text-sm font-bold">{opt.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>

            {/* Avatar (replaces the initial letter in the profile badge) */}
            <div className="pt-2 border-t border-neutral-100">
              <span className="text-sm font-semibold text-neutral-800 block">Profile avatar</span>
              <span className="text-xs text-neutral-500 block mb-2">Shown in the top bar and menu instead of a letter.</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Profile avatar">
                {AVATAR_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={avatarId === id}
                    aria-label={id === 'initial' ? 'Use initial letter' : id === 'admin' ? 'Admin Person Avatar' : id === 'user' ? 'Person Avatar' : id}
                    title={id === 'admin' ? 'Admin Person Avatar (Recommended)' : id === 'user' ? 'Person Avatar' : id}
                    onClick={() => writeAvatar(id)}
                    className={`size-11 rounded-xl flex items-center justify-center font-bold cursor-pointer transition-all ${
                      avatarId === id
                        ? 'bg-emerald-800 text-white ring-2 ring-offset-2 ring-emerald-800'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    <UserAvatar id={id} initial={(orgProfile?.name || 'H').charAt(0).toUpperCase()} size={20} />
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility Switches */}
            <div className="pt-2 border-t border-neutral-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div
                  id="label-settings-high-contrast"
                  onClick={() => setHighContrast(!highContrast)}
                  className="cursor-pointer select-none"
                >
                  <span className="text-sm font-semibold text-neutral-800 block">{t('settings.display.highContrast')}</span>
                  <span className="text-xs text-neutral-500">{t('settings.display.highContrastDesc')}</span>
                </div>
                <ToggleSwitch
                  id="toggle-settings-high-contrast"
                  checked={highContrast}
                  onChange={setHighContrast}
                  ariaLabelledBy="label-settings-high-contrast"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div
                  id="label-settings-easy-view"
                  onClick={toggleLowVisionMode}
                  className="cursor-pointer select-none"
                >
                  <span className="text-sm font-semibold text-neutral-800 block">{t('settings.display.easyView')}</span>
                  <span className="text-xs text-neutral-500">{t('settings.display.easyViewDesc')}</span>
                </div>
                <ToggleSwitch
                  id="toggle-settings-easy-view"
                  checked={lowVisionMode}
                  onChange={() => toggleLowVisionMode()}
                  ariaLabelledBy="label-settings-easy-view"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 6: DATABASE & SUPABASE CLOUD SYNC                                   */}
        {/* ========================================================================= */}
        {activeSection === 'cloud' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900">Database & Cloud Sync</h2>
                <p className="hidden sm:block text-xs text-neutral-500 mt-0.5">
                  Real-time PostgreSQL replication, offline resilience, and ledger state.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  supabaseStatus.isConnected ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {supabaseStatus.isConnected ? 'Cloud Connected' : 'Offline Mode'}
              </span>
            </div>

            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">PostgreSQL Engine:</span>
                <span className="font-mono font-semibold text-neutral-800">Supabase Managed Database</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Project Reference:</span>
                <span className="font-mono font-semibold text-neutral-800">{supabaseConfig.projectRef}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Latency:</span>
                <span className="font-mono font-semibold text-neutral-800">{supabaseStatus.latencyMs}ms</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={async () => {
                  setToastMessage('Sending changes to cloud...');
                  const res = await syncToCloud();
                  setToastMessage(res.message);
                  setTimeout(() => setToastMessage(null), 3500);
                }}
                className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary)] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Push Changes to Cloud</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Re-send EVERYTHING to Supabase? This rewrites every record and uses a lot of database activity. Only needed after restoring or changing the database. "Push Changes to Cloud" sends just what changed.',
                    )
                  ) {
                    return;
                  }
                  setToastMessage('Re-sending everything to cloud...');
                  const res = await syncToCloud({ full: true });
                  setToastMessage(res.message);
                  setTimeout(() => setToastMessage(null), 3500);
                }}
                className="px-2 py-2 text-[11px] font-semibold text-neutral-500 underline underline-offset-2 hover:text-neutral-800 cursor-pointer"
              >
                Re-send everything (rarely needed)
              </button>

              <button
                type="button"
                onClick={async () => {
                  setToastMessage('Checking cloud connection...');
                  await checkSupabaseConnection();
                  setToastMessage('Connection test complete.');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="px-4 py-2 border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 transition-colors cursor-pointer shadow-xs"
              >
                Test Connection
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 7: DATA & BACKUPS (SAFETY & RECOVERY)                                */}
        {/* ========================================================================= */}
        {activeSection === 'backups' && (
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Data & Backups</h2>
              <p className="hidden sm:block text-xs text-neutral-500 mt-0.5">
                Download snapshots of your business ledger or import a JSON backup.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportBackup}
                className="px-4 py-2.5 border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                <span>Export Ledger Backup (.JSON)</span>
              </button>

              <label className="px-4 py-2.5 border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs">
                <Upload className="w-3.5 h-3.5 text-neutral-500" />
                <span>Restore from Backup (.JSON)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Danger Operations */}
            <div className="pt-4 border-t border-neutral-100">
              <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2">Danger Operations</h3>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Clear all bills and vehicle trips? Products catalog and company settings will be kept safely.')) {
                      clearTransactions();
                      setToastMessage('Transaction records cleared.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }
                  }}
                  className="px-3.5 py-2 border border-amber-300 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Clear Bills & Trips
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all ledger data back to factory defaults?')) {
                      resetToDefault();
                      setToastMessage('Ledger reset to defaults.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }
                  }}
                  className="px-3.5 py-2 border border-rose-300 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Factory Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* IN-APP MODAL: EDIT STAFF DETAILS                                          */}
      {/* ========================================================================= */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Edit Staff Details</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Update staff profile, phone number, and permissions</p>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={() => setEditingStaff(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editStaffError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {editStaffError}
              </div>
            )}

            <form onSubmit={handleSaveEditStaff} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Phone / Login Identifier *
                </label>
                <input
                  type="text"
                  required
                  value={editStaffPhone}
                  onChange={(e) => setEditStaffPhone(e.target.value)}
                  placeholder="10-digit mobile number or login"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-900 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Default Assigned Vehicle / Warehouse
                </label>
                <input
                  type="text"
                  value={editStaffVehicle}
                  onChange={(e) => setEditStaffVehicle(e.target.value)}
                  placeholder="e.g. Van 1, Mobile Delivery Unit, Depot A"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  New Security PIN (Optional)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={editStaffNewPin}
                  onChange={(e) => setEditStaffNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Leave blank to keep existing PIN"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-900 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Enter 4 to 6 digits only if resetting their login password/PIN.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span
                  id="label-staff-active-toggle"
                  onClick={() => setEditStaffActive(!editStaffActive)}
                  className="text-xs font-medium text-neutral-700 cursor-pointer select-none"
                >
                  Account is Active (can log in and create sales orders)
                </span>
                <ToggleSwitch
                  id="staffActiveToggle"
                  size="sm"
                  checked={editStaffActive}
                  onChange={setEditStaffActive}
                  ariaLabelledBy="label-staff-active-toggle"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStaffSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[var(--primary)] hover:bg-[var(--primary)] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isStaffSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP MODAL: DEDICATED SET PIN MODAL                                     */}
      {/* ========================================================================= */}
      {pinModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Set Security PIN</h3>
                  <p className="text-xs text-neutral-500 font-medium truncate max-w-[200px]">{pinModalStaff.name}</p>
                </div>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={() => setPinModalStaff(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pinModalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {pinModalError}
              </div>
            )}

            <form onSubmit={handleSavePin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Enter New PIN (4 to 6 digits) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  required
                  value={targetPin}
                  onChange={(e) => setTargetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="e.g. 1234 or 987654"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2.5 text-base text-center text-neutral-900 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                  {pinModalStaff.name} will sign in using phone <strong>{pinModalStaff.phone}</strong> and this PIN.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setPinModalStaff(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPinSubmitting || targetPin.length < 4}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isPinSubmitting ? 'Updating...' : 'Save PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IN-APP MODAL: CONFIRM DELETE STAFF                                        */}
      {/* ========================================================================= */}
      {deletingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Remove Staff Member?</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to remove <strong>{deletingStaff.name}</strong> from staff? Their historical trip and sales records will be preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDeletingStaff(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStaff}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
