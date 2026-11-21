import GstRegistrationCard from './GstRegistrationCard';
import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  X,
  Plus,
  Database,
  Eye,
  Download,
  Upload,
  Cloud,
  Building2,
  Receipt,
  Users,
  Truck,
  Warehouse as WarehouseIcon,
  Pencil,
  Key,
  LogOut,
  Globe,
  Palette,
  Hourglass,
  Trash2,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BeatsSettings } from './BeatsSettings';
import { LoginPageEditor } from './LoginPageEditor';
import { UserAvatar, useAvatarId } from '../common/UserAvatar';
import { AVATAR_IDS, writeAvatar } from '../../utils/avatar';
import { FontSize, GstMode, PriceType, Salesman } from '../../types';
import { validateOrgProfile, summarizeErrors, normalizeGstin } from '../../utils/validation';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { getInitials } from '../ui/HomeKit';
import { confirmDialog } from '../../utils/dialogs';

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
    bills,
    payments,
    customers,
    products,
    grns,
    audits,
    stockTransfers,
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
    setTab,
  } = useLedger();
  const avatarId = useAvatarId();
  const isPhone = useIsMobile(767);

  const { t, language, setLanguage } = useLanguage();

  // Active section filter for navigation (default: business on desktop, home list on phone)
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    // Godowns are managed under the 'fleet' section (Warehouses & Vehicles).
    initialSection === 'warehouses' ? 'fleet' : initialSection || 'business',
  );
  const [mobileSection, setMobileSection] = useState<SettingsSection | null>(
    initialSection ? (initialSection === 'warehouses' ? 'fleet' : initialSection) : null,
  );
  useEffect(() => {
    if (initialSection) {
      const target = initialSection === 'warehouses' ? 'fleet' : initialSection;
      setActiveSection(target);
      setMobileSection(target);
    } else {
      setMobileSection(null);
    }
  }, [initialSection]);

  const [showMobileAddFleet, setShowMobileAddFleet] = useState(false);
  const [mobileFleetDriver, setMobileFleetDriver] = useState('');
  const [showMobileAddStaff, setShowMobileAddStaff] = useState(false);
  const [mobileStaffRole, setMobileStaffRole] = useState<'admin' | 'salesman'>('salesman');
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [showMoreBilling, setShowMoreBilling] = useState(false);
  const [prefLang, setPrefLang] = useState<'en' | 'or'>(() => {
    try {
      return localStorage.getItem('mrwater_app_language') === 'or' ? 'or' : language;
    } catch {
      return language;
    }
  });

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
        manager: mobileFleetDriver || 'Driver',
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
  const handleAddStaffMember = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!newStaffIdentifier.trim()) return false;

    const identifier = newStaffIdentifier.trim();
    const isEmail = identifier.includes('@');
    const name = isEmail ? identifier.split('@')[0] : identifier;
    const phone = isEmail ? '9' + Math.floor(100000000 + Math.random() * 900000000) : identifier;

    // A real PIN is required: the old form silently gave everyone 1234.
    if (!/^\d{4,6}$/.test(newStaffPin)) {
      setToastMessage('Enter a 4 to 6 digit PIN for this staff member (6 digits is safer).');
      setTimeout(() => setToastMessage(null), 3500);
      return false;
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
      setTimeout(() => setToastMessage(null), 3500);
      return true;
    } else {
      setToastMessage(res.error || 'Failed to add staff member.');
      setTimeout(() => setToastMessage(null), 3500);
      return false;
    }
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

  if (isPhone) {
    const ownerLabel =
      (currentUser && 'name' in currentUser && currentUser.name) ||
      currentUser?.username ||
      profileForm.ownerName ||
      'Owner';
    const ownerSub =
      (currentUser && 'email' in currentUser ? currentUser.email : '') ||
      (currentUser && 'phone' in currentUser ? currentUser.phone : '') ||
      profileForm.email ||
      profileForm.phone ||
      '';
    const ownerInitial = (orgProfile?.name || ownerLabel || 'H').charAt(0).toUpperCase();
    const isOwnerAdmin = currentUser?.role === 'admin';

    const paperChoice =
      billingForm.defaultInvoicePaper === '80mm' || billingForm.printLayout === 'Thermal 3-inch (80mm)'
        ? '80mm'
        : billingForm.printLayout === 'Half Page A5'
          ? 'a5'
          : 'a4';

    const renderPhoneToast = () =>
      isSaving || toastMessage ? (
        <div className="hh-inv-toast" role="status">
          {isSaving ? (
            <Hourglass size={16} className="text-amber-300 shrink-0" />
          ) : (
            <Check size={16} className="text-emerald-300 shrink-0" />
          )}
          <span className="truncate">{isSaving ? 'Saving settings to database...' : toastMessage}</span>
        </div>
      ) : null;

    if (mobileSection === 'beats' && isOwnerAdmin) {
      return <BeatsSettings onBack={() => setMobileSection(null)} />;
    }

    if (mobileSection === 'login' && isOwnerAdmin) {
      return <LoginPageEditor onBack={() => setMobileSection(null)} />;
    }

    if (mobileSection === 'business') {
      const gstBadgeText = orgProfile.gstRegistrationType
        ? orgProfile.gstRegistrationType === 'composition'
          ? 'Composition'
          : 'Unregistered'
        : profileForm.gstin.trim().length >= 15
          ? 'Registered'
          : 'Not registered';
      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Business</span>
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-2.5">
            <label className="hh-inv-field hh-inv-field--focus">
              <span className="hh-inv-field__label">BUSINESS NAME</span>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Shree Beverages Distributors"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">GSTIN</span>
                <input
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
                  className="uppercase"
                />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">PAN</span>
                <input
                  type="text"
                  maxLength={10}
                  value={profileForm.pan}
                  onChange={(e) => setProfileForm({ ...profileForm, pan: e.target.value.toUpperCase() })}
                  placeholder="AAKCS1234F"
                  className="uppercase"
                />
              </label>
            </div>

            <label className="hh-inv-field">
              <span className="hh-inv-field__label">FSSAI / LICENCE NO.</span>
              <input
                type="text"
                maxLength={14}
                value={profileForm.fssai}
                onChange={(e) => setProfileForm({ ...profileForm, fssai: e.target.value })}
                placeholder="11521034000123"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">PHONE</span>
                <input
                  type="text"
                  inputMode="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="9822012345"
                />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">EMAIL</span>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder="sales@shreebeverages.com"
                />
              </label>
            </div>

            <label className="hh-inv-field">
              <span className="hh-inv-field__label">ADDRESS</span>
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Plot 14, MIDC Bhosari, Pune 411026"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">CITY / STATE</span>
                <input
                  type="text"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  placeholder="Pune, Maharashtra"
                />
              </label>
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">SIGNATORY</span>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => setProfileForm({ ...profileForm, ownerName: e.target.value })}
                  placeholder="Proprietor"
                />
              </label>
            </div>

            <label className="hh-inv-field">
              <span className="hh-inv-field__label">GST STATE CODE</span>
              <select
                value={profileForm.state}
                onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </label>

            <p className="text-xs text-slate-500 px-0.5 leading-snug">
              GST registration: <strong className="text-slate-700">{gstBadgeText}</strong> below the GSTIN.
            </p>

            <div className="pt-2">
              <div className="hh-set-section-lbl">BANK DETAILS</div>
              <div className="space-y-2.5">
                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">BANK NAME</span>
                  <input
                    type="text"
                    value={profileForm.bankName}
                    onChange={(e) => setProfileForm({ ...profileForm, bankName: e.target.value })}
                    placeholder="HDFC Bank"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">ACCOUNT NO.</span>
                    <input
                      type="text"
                      value={profileForm.accountNumber}
                      onChange={(e) => setProfileForm({ ...profileForm, accountNumber: e.target.value })}
                      placeholder="50200012345678"
                    />
                  </label>
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">IFSC</span>
                    <input
                      type="text"
                      maxLength={11}
                      value={profileForm.ifsc}
                      onChange={(e) => setProfileForm({ ...profileForm, ifsc: e.target.value.toUpperCase() })}
                      placeholder="HDFC0001234"
                      className="uppercase"
                    />
                  </label>
                </div>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">UPI ID</span>
                  <input
                    type="text"
                    value={profileForm.upiId}
                    onChange={(e) => setProfileForm({ ...profileForm, upiId: e.target.value })}
                    placeholder="shreebev@upi"
                  />
                </label>
              </div>
            </div>

            <div className="pt-1">
              <div className="hh-set-section-lbl">INVOICE TERMS</div>
              <label className="hh-inv-field">
                <textarea
                  rows={3}
                  value={profileForm.invoiceTerms}
                  onChange={(e) => setProfileForm({ ...profileForm, invoiceTerms: e.target.value })}
                  placeholder="Goods once sold will not be taken back except expiry/damage. Interest @18% after due date."
                  className="!font-medium"
                />
              </label>
            </div>
          </div>

          {renderPhoneToast()}

          <div className="hh-set-footer">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveAll}
              className="hh-inv-btn-primary w-full"
            >
              {isSaving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </div>
      );
    }

    if (mobileSection === 'billing') {
      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Billing rules</span>
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-4">
            <div>
              <div className="hh-set-section-lbl">PAPER SIZE</div>
              <div className="space-y-2" role="radiogroup" aria-label="Paper size">
                {[
                  { id: '80mm', label: 'Thermal 3-inch (80mm)', layout: 'Thermal 3-inch (80mm)', paper: '80mm' as const },
                  { id: 'a5', label: 'Half Page A5', layout: 'Half Page A5', paper: 'a4' as const },
                  { id: 'a4', label: 'A4 invoice (full GST layout)', layout: 'A4', paper: 'a4' as const },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={paperChoice === opt.id}
                    onClick={() =>
                      setBillingForm({
                        ...billingForm,
                        printLayout: opt.layout,
                        defaultInvoicePaper: opt.paper,
                      })
                    }
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="hh-set-section-lbl">PRICE MODE</div>
              <div className="space-y-2" role="radiogroup" aria-label="Price mode">
                {[
                  { id: 'Retail' as PriceType, label: 'Retail (MRP / Direct Retail Rate)' },
                  { id: 'Wholesale' as PriceType, label: 'Wholesale (Bulk Kirana Shop Rate)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={billingForm.defaultSaleType === opt.id}
                    onClick={() => setBillingForm({ ...billingForm, defaultSaleType: opt.id })}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="hh-set-section-lbl">TAX MODE</div>
              <div className="space-y-2" role="radiogroup" aria-label="Tax mode">
                {[
                  { id: 'inclusive' as GstMode, label: 'GST Inclusive (Rate includes Tax)' },
                  { id: 'off' as GstMode, label: 'GST Off / Non-Tax Bill' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={billingForm.defaultGstMode === opt.id}
                    onClick={() => setBillingForm({ ...billingForm, defaultGstMode: opt.id })}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="hh-set-section-lbl">LIMIT EXCEEDED</div>
              <div className="space-y-2" role="radiogroup" aria-label="Credit limit crossed">
                {[
                  { id: 'Block', label: 'Block billing' },
                  { id: 'Warn', label: 'Warn before billing' },
                  { id: 'Allow', label: 'Allow without warning' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={billingForm.creditLimitCrossed === opt.id}
                    onClick={() => setBillingForm({ ...billingForm, creditLimitCrossed: opt.id })}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="hh-inv-field">
              <span className="hh-inv-field__label">INVOICE PREFIX</span>
              <input
                type="text"
                value={billingForm.invoicePrefix}
                onChange={(e) => setBillingForm({ ...billingForm, invoicePrefix: e.target.value.toUpperCase() })}
                placeholder="INV"
                className="uppercase"
              />
            </label>

            <div>
              <div className="hh-set-section-lbl">SHARE MESSAGE STYLE</div>
              <div className="space-y-2" role="radiogroup" aria-label="WhatsApp message style">
                {[
                  { id: 'detailed' as const, label: 'Detailed message (with icons)' },
                  { id: 'receipt' as const, label: '80 mm receipt text' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={billingForm.whatsappTextStyle === opt.id}
                    onClick={() => setBillingForm({ ...billingForm, whatsappTextStyle: opt.id })}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-snug">
                Receipt text is used when the style above is the 80 mm receipt text.
              </p>
            </div>

            {billingForm.whatsappTextStyle === 'receipt' && (
              <label className="hh-inv-field">
                <span className="hh-inv-field__label">RECEIPT TEXT WIDTH (CHARACTERS)</span>
                <select
                  value={billingForm.receiptTextWidth}
                  onChange={(e) => setBillingForm({ ...billingForm, receiptTextWidth: Number(e.target.value) as 32 | 42 | 48 })}
                >
                  <option value={32}>32 - fits a phone chat (WhatsApp)</option>
                  <option value={42}>42 - 80 mm printer apps</option>
                  <option value={48}>48 - 80 mm printer apps, small font</option>
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => setShowMoreBilling((v) => !v)}
              className="w-full flex items-center justify-between px-1 py-2 text-xs font-bold text-[#2864d9] cursor-pointer"
            >
              <span>GST registration, stock &amp; receipt toggles</span>
              <ChevronDown size={16} className={`transition-transform ${showMoreBilling ? 'rotate-180' : ''}`} />
            </button>

            {showMoreBilling && (
              <div className="space-y-3 pb-2">
                <GstRegistrationCard />
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">EXPIRY ALERT (DAYS)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={billingForm.expiryAlertDays}
                      onChange={(e) => setBillingForm({ ...billingForm, expiryAlertDays: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">MAX DISCOUNT (%)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={billingForm.maxSalesmanDiscountPercent}
                      onChange={(e) =>
                        setBillingForm({
                          ...billingForm,
                          maxSalesmanDiscountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="hh-inv-card space-y-3">
                  {[
                    {
                      id: 'm-earliest',
                      label: 'Sell earliest expiry first',
                      checked: billingForm.sellEarliestExpiryFirst,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, sellEarliestExpiryFirst: v }),
                    },
                    {
                      id: 'm-nostock',
                      label: 'Allow selling without stock',
                      checked: billingForm.allowSellingWithoutStock,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, allowSellingWithoutStock: v }),
                    },
                    {
                      id: 'm-round',
                      label: 'Round off bill total',
                      checked: billingForm.roundOffGrandTotal,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, roundOffGrandTotal: v }),
                    },
                    {
                      id: 'm-batch',
                      label: 'Print batch numbers & expiry on invoices',
                      checked: billingForm.showBatchOnInvoice,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, showBatchOnInvoice: v }),
                    },
                    {
                      id: 'm-upiqr',
                      label: 'Print UPI QR on 80 mm receipt',
                      checked: billingForm.showUpiQrOnReceipt,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, showUpiQrOnReceipt: v }),
                    },
                    {
                      id: 'm-odia',
                      label: 'Print Odia product names on 80 mm receipt',
                      checked: billingForm.showOdiaNameOnReceipt,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, showOdiaNameOnReceipt: v }),
                    },
                    {
                      id: 'm-gstfree',
                      label: 'Charge GST on free scheme cases',
                      checked: billingForm.gstOnFreeCases,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, gstOnFreeCases: v }),
                    },
                    {
                      id: 'm-autosc',
                      label: 'Auto-apply qualifying schemes in Billing',
                      checked: billingForm.autoApplyPromotions,
                      onChange: (v: boolean) => setBillingForm({ ...billingForm, autoApplyPromotions: v }),
                    },
                  ].map((sw) => (
                    <div key={sw.id} className="flex items-center justify-between gap-3">
                      <span
                        id={`${sw.id}-lbl`}
                        onClick={() => sw.onChange(!sw.checked)}
                        className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
                      >
                        {sw.label}
                      </span>
                      <ToggleSwitch
                        id={sw.id}
                        size="sm"
                        checked={sw.checked}
                        onChange={sw.onChange}
                        ariaLabelledBy={`${sw.id}-lbl`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {renderPhoneToast()}

          <div className="hh-set-footer">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveAll}
              className="hh-inv-btn-primary w-full"
            >
              {isSaving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </div>
      );
    }

    if (mobileSection === 'fleet') {
      if (showMobileAddFleet) {
        return (
          <div id="view-settings" className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button type="button" className="hh-inv-backbtn" onClick={() => setShowMobileAddFleet(false)}>
                  <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                  <span>Add to fleet</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                handleAddWarehouseOrVehicle(e);
                setShowMobileAddFleet(false);
                setMobileFleetDriver('');
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="rt-flow-phone__body space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">Type</div>
                  <div className="hh-set-seg2">
                    <button
                      type="button"
                      className="hh-set-seg2__btn"
                      aria-pressed={newWhType === 'warehouse'}
                      onClick={() => setNewWhType('warehouse')}
                    >
                      Warehouse
                    </button>
                    <button
                      type="button"
                      className="hh-set-seg2__btn"
                      aria-pressed={newWhType === 'vehicle'}
                      onClick={() => setNewWhType('vehicle')}
                    >
                      Vehicle
                    </button>
                  </div>
                </div>

                <label className="hh-inv-field hh-inv-field--focus">
                  <span className="hh-inv-field__label">NAME</span>
                  <input
                    type="text"
                    required
                    value={newWhName}
                    onChange={(e) => setNewWhName(e.target.value)}
                    placeholder={newWhType === 'vehicle' ? 'Van 3' : 'Central Depot'}
                  />
                </label>

                {newWhType === 'vehicle' && (
                  <>
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">REG. NO.</span>
                      <input
                        type="text"
                        value={newWhRegNo}
                        onChange={(e) => setNewWhRegNo(e.target.value)}
                        placeholder="OD-02-CD-7788"
                        className="uppercase"
                      />
                    </label>

                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">DRIVER (OPTIONAL)</span>
                      <select
                        value={mobileFleetDriver}
                        onChange={(e) => setMobileFleetDriver(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {salesmen.map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>

              <div className="hh-set-footer">
                <button
                  type="submit"
                  disabled={!newWhName.trim()}
                  className="hh-inv-btn-primary w-full"
                >
                  {newWhType === 'warehouse' ? 'Add warehouse' : 'Add vehicle'}
                </button>
              </div>
            </form>
          </div>
        );
      }

      const warehouseLocations = warehouses.filter(
        (wh) => !(wh.notes?.includes('Vehicle') || wh.location.includes('Van') || wh.name.toLowerCase().includes('van')),
      );
      const vehicleLocations = warehouses.filter(
        (wh) => wh.notes?.includes('Vehicle') || wh.location.includes('Van') || wh.name.toLowerCase().includes('van'),
      );

      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Fleet</span>
              </button>
              <button
                type="button"
                className="hh-sales-top__iconbtn"
                aria-label="Add to fleet"
                onClick={() => setShowMobileAddFleet(true)}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-4 hh-inv-pb">
            <div>
              <div className="hh-set-section-lbl">WAREHOUSES</div>
              <div className="hh-set-list">
                {warehouseLocations.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">No warehouses added yet.</div>
                ) : (
                  warehouseLocations.map((wh) => (
                    <div
                      key={wh.id}
                      onClick={() => setTab('warehouses')}
                      className="hh-set-row"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTab('warehouses'); }}
                    >
                      <span className="hh-set-icon bg-amber-50 text-amber-700">
                        <WarehouseIcon size={17} aria-hidden="true" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">{wh.name}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          {wh.code}{wh.isDefault ? ' · default' : ''}
                        </div>
                      </div>
                      <span className="hh-set-badge-green shrink-0">Active</span>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setTab('warehouses')}
                className="mt-2 text-xs font-bold text-[#2864d9] px-1 cursor-pointer"
              >
                Open Godowns &amp; capacity →
              </button>
            </div>

            <div>
              <div className="hh-set-section-lbl">VEHICLES</div>
              <div className="hh-set-list">
                {vehicleLocations.length === 0 && existingVehicles.filter((v) => !warehouses.some((w) => w.name.includes(v))).length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">No vehicles added yet. Tap + to add one.</div>
                ) : (
                  <>
                    {vehicleLocations.map((wh) => {
                      const driver = salesmen.find((s) => (s.defaultVehicle || s.default_vehicle || '').includes(wh.name))?.name || wh.manager;
                      return (
                        <div key={wh.id} className="hh-set-row !cursor-default">
                          <span className="hh-set-icon bg-orange-50 text-orange-600">
                            <Truck size={17} aria-hidden="true" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-extrabold text-slate-900 truncate">{wh.name}</div>
                            <div className="text-xs text-slate-500 truncate">{driver || wh.code}</div>
                          </div>
                          <span className="hh-set-badge-green shrink-0">Active</span>
                          {warehouses.length > 1 && !wh.isDefault && (
                            <button
                              type="button"
                              aria-label={`Delete ${wh.name}`}
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: `Delete ${wh.name}?`,
                                  message: 'This removes it from the database. Bills and stock already recorded are not deleted.',
                                  confirmLabel: 'Delete',
                                  tone: 'danger',
                                });
                                if (!ok) return;
                                deleteWarehouse(wh.id);
                                setToastMessage(`Removed ${wh.name}`);
                                setTimeout(() => setToastMessage(null), 3000);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {existingVehicles
                      .filter((v) => !warehouses.some((w) => w.name.includes(v)))
                      .map((vehName, idx) => {
                        const driver = salesmen.find((s) => (s.defaultVehicle || s.default_vehicle) === vehName)?.name;
                        return (
                          <div key={`veh-${idx}`} className="hh-set-row !cursor-default">
                            <span className="hh-set-icon bg-orange-50 text-orange-600">
                              <Truck size={17} aria-hidden="true" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{vehName}</div>
                              {driver && <div className="text-xs text-slate-500 truncate">{driver}</div>}
                            </div>
                            <span className="hh-set-badge-green shrink-0">Active</span>
                          </div>
                        );
                      })}
                  </>
                )}
              </div>
            </div>
          </div>

          {renderPhoneToast()}
        </div>
      );
    }

    if (mobileSection === 'staff') {
      if (pinModalStaff) {
        return (
          <div id="view-settings" className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button type="button" className="hh-inv-backbtn" onClick={() => setPinModalStaff(null)}>
                  <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                  <span>Set PIN</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSavePin} className="flex flex-col flex-1 min-h-0">
              <div className="rt-flow-phone__body pt-6 text-center space-y-5">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">Set security PIN</h2>
                  <p className="text-xs text-slate-500 mt-0.5">for {pinModalStaff.name}</p>
                </div>

                {pinModalError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold text-left">
                    {pinModalError}
                  </div>
                )}

                <div className="hh-set-pin-wrap">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const filled = idx < targetPin.length;
                    const activeSlot = idx === Math.min(targetPin.length, 5);
                    return (
                      <div
                        key={idx}
                        className={`hh-set-pin-box ${activeSlot ? 'hh-set-pin-box--active' : ''}`}
                        aria-hidden="true"
                      >
                        {filled ? '•' : ''}
                      </div>
                    );
                  })}
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    aria-label="Enter 4 to 6 digit security PIN"
                    value={targetPin}
                    onChange={(e) => setTargetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                  />
                </div>

                <p className="text-xs text-slate-500">
                  PIN (4–6 digits), e.g. 1234 or 987654
                </p>
              </div>

              <div className="hh-set-footer">
                <button
                  type="submit"
                  disabled={isPinSubmitting || targetPin.length < 4}
                  className="hh-inv-btn-primary w-full"
                >
                  {isPinSubmitting ? 'Saving PIN...' : 'Save PIN'}
                </button>
              </div>
            </form>
          </div>
        );
      }

      if (editingStaff) {
        return (
          <div id="view-settings" className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button type="button" className="hh-inv-backbtn" onClick={() => setEditingStaff(null)}>
                  <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                  <span>Edit staff details</span>
                </button>
                <button
                  type="button"
                  className="hh-sales-top__iconbtn"
                  aria-label={`Remove ${editingStaff.name}`}
                  onClick={() => setDeletingStaff(editingStaff)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEditStaff} className="flex flex-col flex-1 min-h-0">
              <div className="rt-flow-phone__body space-y-3">
                {editStaffError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                    {editStaffError}
                  </div>
                )}

                <label className="hh-inv-field hh-inv-field--focus">
                  <span className="hh-inv-field__label">NAME</span>
                  <input
                    type="text"
                    required
                    value={editStaffName}
                    onChange={(e) => setEditStaffName(e.target.value)}
                    placeholder="e.g. Sunil Das"
                  />
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">LOGIN (EMAIL OR 10-DIGIT MOBILE)</span>
                  <input
                    type="text"
                    required
                    value={editStaffPhone}
                    onChange={(e) => setEditStaffPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                  />
                </label>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5">Role</div>
                  <div className="hh-set-seg2">
                    <button
                      type="button"
                      className="hh-set-seg2__btn"
                      aria-pressed={mobileStaffRole === 'admin'}
                      onClick={() => setMobileStaffRole('admin')}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      className="hh-set-seg2__btn"
                      aria-pressed={mobileStaffRole === 'salesman'}
                      onClick={() => setMobileStaffRole('salesman')}
                    >
                      Salesman
                    </button>
                  </div>
                </div>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">VEHICLE</span>
                  <input
                    type="text"
                    list="mobile-staff-vehicles"
                    value={editStaffVehicle}
                    onChange={(e) => setEditStaffVehicle(e.target.value)}
                    placeholder="e.g. Van 1"
                  />
                  <datalist id="mobile-staff-vehicles">
                    {existingVehicles.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">PIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={editStaffNewPin}
                    onChange={(e) => setEditStaffNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Leave blank to keep existing PIN"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 py-1 px-0.5">
                  <span
                    id="m-staff-active-lbl"
                    onClick={() => setEditStaffActive(!editStaffActive)}
                    className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                  >
                    Account is Active (can sign in)
                  </span>
                  <ToggleSwitch
                    id="m-staffActiveToggle"
                    size="sm"
                    checked={editStaffActive}
                    onChange={setEditStaffActive}
                    ariaLabelledBy="m-staff-active-lbl"
                  />
                </div>
              </div>

              <div className="hh-set-footer grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenSetPin(editingStaff)}
                  className="hh-inv-btn-outline"
                >
                  Set PIN
                </button>
                <button
                  type="submit"
                  disabled={isStaffSubmitting}
                  className="hh-inv-btn-primary"
                >
                  {isStaffSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>

            {deletingStaff && (
              <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Remove staff member" onClick={() => setDeletingStaff(null)}>
                <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                  <div className="hh-grab" aria-hidden="true" />
                  <h3 className="text-base font-extrabold text-rose-600">Remove staff member?</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {deletingStaff.name} will no longer be able to sign in. Past bills stay as they are.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button type="button" className="hh-inv-btn-outline" onClick={() => setDeletingStaff(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="hh-inv-btn-danger"
                      onClick={async () => {
                        await handleConfirmDeleteStaff();
                        setEditingStaff(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      if (showMobileAddStaff) {
        return (
          <div id="view-settings" className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button type="button" className="hh-inv-backbtn" onClick={() => setShowMobileAddStaff(false)}>
                  <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                  <span>Add staff member</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                const ok = await handleAddStaffMember(e);
                if (ok) setShowMobileAddStaff(false);
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="rt-flow-phone__body space-y-3">
                <label className="hh-inv-field hh-inv-field--focus">
                  <span className="hh-inv-field__label">LOGIN (EMAIL OR 10-DIGIT MOBILE)</span>
                  <input
                    type="text"
                    required
                    value={newStaffIdentifier}
                    onChange={(e) => setNewStaffIdentifier(e.target.value)}
                    placeholder="9437012345"
                  />
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">PIN (4–6 DIGITS)</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 1234 or 987654"
                  />
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">ROLE</span>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as any)}
                    className="capitalize"
                  >
                    <option value="driver">Driver</option>
                    <option value="salesman">Salesman</option>
                    <option value="manager">Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>

              <div className="hh-set-footer">
                <button
                  type="submit"
                  disabled={!newStaffIdentifier.trim() || newStaffPin.length < 4}
                  className="hh-inv-btn-primary w-full"
                >
                  Add staff
                </button>
              </div>
            </form>
          </div>
        );
      }

      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Staff</span>
              </button>
              <button
                type="button"
                className="hh-sales-top__iconbtn"
                aria-label="Add staff member"
                onClick={() => setShowMobileAddStaff(true)}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-2.5 hh-inv-pb">
            <div className="hh-inv-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="size-10 rounded-full bg-slate-100 text-slate-700 font-extrabold text-sm flex items-center justify-center shrink-0">
                  {getInitials(ownerLabel, 'O').charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{ownerLabel}</div>
                  <div className="text-xs text-slate-500 truncate">{ownerSub}</div>
                </div>
              </div>
              <span className="hh-set-badge-green shrink-0">Admin</span>
            </div>

            {salesmen.map((salesman) => (
              <button
                key={salesman.id}
                type="button"
                onClick={() => {
                  setMobileStaffRole('salesman');
                  handleOpenEditStaff(salesman);
                }}
                className="hh-inv-card w-full flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-10 rounded-full bg-slate-100 text-slate-700 font-extrabold text-sm flex items-center justify-center shrink-0">
                    {getInitials(salesman.name || 'S', 'S').charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{salesman.name}</span>
                      {!salesman.active && <span className="hh-set-badge-slate">Off</span>}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums truncate">
                      {salesman.phone}
                    </div>
                  </div>
                </div>
                <span className="hh-set-badge-blue shrink-0">Salesman</span>
              </button>
            ))}

            <div className="pt-1">
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Log out?',
                    message: 'You will need to sign in again.',
                    confirmLabel: 'Log out',
                    tone: 'warning',
                  });
                  if (ok && typeof logout === 'function') logout();
                }}
                className="hh-set-btn-danger-outline w-full"
              >
                Sign out
              </button>
            </div>
          </div>

          {renderPhoneToast()}

          {deletingStaff && (
            <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Remove staff member" onClick={() => setDeletingStaff(null)}>
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="hh-grab" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-rose-600">Remove staff member?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {deletingStaff.name} will no longer be able to sign in. Past bills stay as they are.
                </p>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button type="button" className="hh-inv-btn-outline" onClick={() => setDeletingStaff(null)}>
                    Keep
                  </button>
                  <button
                    type="button"
                    className="hh-inv-btn-danger"
                    onClick={handleConfirmDeleteStaff}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (mobileSection === 'display') {
      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Display</span>
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-4 hh-inv-pb">
            <div>
              <div className="hh-set-section-lbl">TEXT SIZE</div>
              <div className="space-y-2" role="radiogroup" aria-label="Text size">
                {[
                  { id: 'standard' as FontSize, title: t('settings.display.fontStandard') },
                  { id: 'large' as FontSize, title: t('settings.display.fontLarge') },
                  { id: 'xlarge' as FontSize, title: t('settings.display.fontXLarge') },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={fontSize === opt.id}
                    onClick={() => setFontSize(opt.id)}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" aria-hidden="true" />
                    <span className="text-sm font-bold">{opt.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hh-inv-card">
              <div className="text-sm font-extrabold text-slate-900">Sample text</div>
              <div className="text-xs text-slate-500 mt-0.5">Sri Balaji Stores · ₹2,400 due</div>
            </div>

            <div>
              <div className="hh-set-section-lbl">PROFILE AVATAR</div>
              <div className="hh-inv-card flex items-center gap-3">
                <span className="w-8 h-10 rounded-full bg-[#2864d9] text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  <UserAvatar id={avatarId} initial={ownerInitial} size={16} />
                </span>
                <p className="text-xs text-slate-500 flex-1 min-w-0 leading-snug">
                  Shown in the top bar and menu instead of a letter.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAvatarSheet(true)}
                  className="text-xs font-bold text-[#2864d9] shrink-0 cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>

            <div>
              <div className="hh-set-section-lbl">LANGUAGE</div>
              <div className="hh-set-seg2">
                <button
                  type="button"
                  className="hh-set-seg2__btn"
                  aria-pressed={prefLang === 'en'}
                  onClick={() => {
                    setPrefLang('en');
                    setLanguage('en');
                  }}
                >
                  English
                </button>
                <button
                  type="button"
                  className="hh-set-seg2__btn"
                  aria-pressed={prefLang === 'or'}
                  onClick={() => {
                    setPrefLang('or');
                    setLanguage('or');
                    setToastMessage('Odia applied to salesman views.');
                    setTimeout(() => setToastMessage(null), 3000);
                  }}
                >
                  ଓଡ଼ିଆ
                </button>
              </div>
            </div>

            <div className="hh-inv-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div
                  id="m-disp-hc-lbl"
                  onClick={() => setHighContrast(!highContrast)}
                  className="cursor-pointer select-none min-w-0"
                >
                  <div className="text-xs font-bold text-slate-900">{t('settings.display.highContrast')}</div>
                  <div className="text-[11px] text-slate-500">{t('settings.display.highContrastDesc')}</div>
                </div>
                <ToggleSwitch
                  id="m-toggle-hc"
                  size="sm"
                  checked={highContrast}
                  onChange={setHighContrast}
                  ariaLabelledBy="m-disp-hc-lbl"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div
                  id="m-disp-ev-lbl"
                  onClick={toggleLowVisionMode}
                  className="cursor-pointer select-none min-w-0"
                >
                  <div className="text-xs font-bold text-slate-900">{t('settings.display.easyView')}</div>
                  <div className="text-[11px] text-slate-500">{t('settings.display.easyViewDesc')}</div>
                </div>
                <ToggleSwitch
                  id="m-toggle-ev"
                  size="sm"
                  checked={lowVisionMode}
                  onChange={() => toggleLowVisionMode()}
                  ariaLabelledBy="m-disp-ev-lbl"
                />
              </div>
            </div>
          </div>

          {renderPhoneToast()}

          {showAvatarSheet && (
            <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Choose profile avatar" onClick={() => setShowAvatarSheet(false)}>
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="hh-grab" aria-hidden="true" />
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">Choose profile avatar</h3>
                  <button type="button" onClick={() => setShowAvatarSheet(false)} aria-label="Close" className="p-1 text-slate-400">
                    <X size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2.5 pt-1">
                  {AVATAR_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        writeAvatar(id);
                        setShowAvatarSheet(false);
                      }}
                      className={`h-12 rounded-xl flex items-center justify-center font-bold cursor-pointer transition-all ${
                        avatarId === id
                          ? 'bg-[#2864d9] text-white ring-2 ring-offset-2 ring-[#2864d9]'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <UserAvatar id={id} initial={ownerInitial} size={20} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (mobileSection === 'cloud') {
      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Cloud</span>
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-3">
            <div className="hh-inv-card space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Engine</span>
                <span className="font-bold text-slate-900">PostgreSQL</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Managed by</span>
                <span className="font-bold text-slate-900">Supabase</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Project reference</span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[55%]">{supabaseConfig.projectRef}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Latency</span>
                <span className="font-bold text-emerald-700 tabular-nums">{supabaseStatus.latencyMs} ms</span>
              </div>
            </div>

            <div className="hh-inv-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Last sync</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {supabaseStatus.lastSyncedAt ? `${supabaseStatus.lastSyncedAt} · all changes saved` : 'All changes saved'}
                </div>
              </div>
              <span className={supabaseStatus.isConnected ? 'hh-set-badge-green shrink-0' : 'hh-set-badge-slate shrink-0'}>
                {supabaseStatus.isConnected ? 'Synced' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between px-1 pt-1">
              <button
                type="button"
                disabled={isPulling}
                onClick={handlePullCloud}
                className="text-xs font-bold text-[#2864d9] cursor-pointer"
              >
                {isPulling ? 'Pulling...' : 'Pull latest from cloud'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setToastMessage('Checking cloud connection...');
                  await checkSupabaseConnection();
                  setToastMessage('Connection test complete.');
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="text-xs font-bold text-slate-600 cursor-pointer"
              >
                Test connection
              </button>
            </div>
          </div>

          {renderPhoneToast()}

          <div className="hh-set-footer">
            <button
              type="button"
              onClick={async () => {
                setToastMessage('Sending changes to cloud...');
                const res = await syncToCloud();
                setToastMessage(res.message);
                setTimeout(() => setToastMessage(null), 3500);
              }}
              className="hh-inv-btn-primary w-full"
            >
              Push changes to cloud
            </button>
          </div>
        </div>
      );
    }

    if (mobileSection === 'backups') {
      return (
        <div id="view-settings" className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button type="button" className="hh-inv-backbtn" onClick={() => setMobileSection(null)}>
                <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
                <span>Backups</span>
              </button>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-4 hh-inv-pb">
            <div className="space-y-2.5">
              <div className="hh-set-section-lbl">DATA AND BACKUPS</div>
              <button type="button" onClick={exportBackup} className="hh-inv-btn-primary w-full">
                Export ledger backup (.JSON)
              </button>
              <label className="hh-inv-btn-outline w-full">
                <span>Restore from backup (.JSON)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>

            <div>
              <div className="hh-set-section-lbl !text-rose-600">DANGER OPERATIONS</div>
              <div className="hh-inv-card hh-inv-card--alert-red space-y-3">
                <div>
                  <div className="text-sm font-extrabold text-rose-600">Reset data</div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                    {isOwnerAdmin
                      ? 'Clearing or resetting data can only be done by the owner.'
                      : 'Clearing or resetting data can only be done by the owner.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isOwnerAdmin}
                  onClick={() => setShowResetSheet(true)}
                  className="hh-set-btn-danger-outline w-full disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Reset...
                </button>
              </div>
            </div>
          </div>

          {renderPhoneToast()}

          {showResetSheet && isOwnerAdmin && (
            <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-label="Reset options" onClick={() => setShowResetSheet(false)}>
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="hh-grab" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-rose-600">Reset data</h3>
                <p className="text-xs text-slate-600">
                  These cannot be undone. Each asks you to download a backup and type a confirmation word.
                </p>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setShowResetSheet(false);
                      const ok = await confirmDialog({
                        title: 'Clear all bills, payments and trips?',
                        message:
                          'This deletes every transaction record on this device and in the cloud. Your products, customers, GRNs, stock batches and company settings are kept.',
                        details: [
                          `${bills.length} bills`,
                          `${payments.length} payments / receipts`,
                          `${trips.length} vehicle trips`,
                          `${audits.length} stock audits`,
                          `${stockTransfers.length} stock transfers`,
                        ],
                        confirmLabel: 'Clear records',
                        tone: 'danger',
                        typeToConfirm: 'CLEAR',
                        extraAction: { label: 'Download a backup file first', onClick: () => exportBackup() },
                      });
                      if (!ok) return;
                      clearTransactions();
                      setToastMessage('Bills, payments and trips cleared.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="w-full p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-left cursor-pointer"
                  >
                    <div className="text-sm font-bold text-amber-900">Clear Bills, Payments &amp; Trips</div>
                    <div className="text-xs text-amber-800/80 mt-0.5">Keeps products, customers, stock batches and company settings.</div>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setShowResetSheet(false);
                      const ok = await confirmDialog({
                        title: 'Factory reset: erase everything?',
                        message:
                          'This deletes all business data and puts the company profile and billing / GST settings back to defaults.',
                        details: [
                          `${bills.length} bills and ${payments.length} payments`,
                          `${customers.length} customers`,
                          `${products.length} products`,
                          `${grns.length} GRNs (purchases)`,
                          `${warehouses.length} warehouses / vehicles (reset to the default one)`,
                          'Company profile and billing / GST settings',
                        ],
                        confirmLabel: 'Erase everything',
                        tone: 'danger',
                        typeToConfirm: 'RESET',
                        extraAction: { label: 'Download a backup file first', onClick: () => exportBackup() },
                      });
                      if (!ok) return;
                      resetToDefault();
                      setToastMessage('Ledger reset to defaults.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="w-full p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-left cursor-pointer"
                  >
                    <div className="text-sm font-bold text-rose-700">Factory Reset</div>
                    <div className="text-xs text-rose-600/80 mt-0.5">Erases all records and resets company &amp; billing settings.</div>
                  </button>

                  <button type="button" onClick={() => setShowResetSheet(false)} className="hh-inv-btn-outline w-full">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Settings Home screen (mobileSection === null)
    const homeItems: {
      id: SettingsSection;
      title: string;
      subtitle: string;
      icon: React.ReactNode;
      iconClass: string;
    }[] = [
      {
        id: 'business',
        title: t('settings.section.business'),
        subtitle: 'Organisation and tax profile',
        icon: <Building2 size={17} aria-hidden="true" />,
        iconClass: 'bg-blue-50 text-[#2864d9]',
      },
      {
        id: 'billing',
        title: t('settings.section.billing'),
        subtitle: 'Invoicing, taxes and limits',
        icon: <Receipt size={17} aria-hidden="true" />,
        iconClass: 'bg-slate-100 text-slate-700',
      },
      {
        id: 'fleet',
        title: t('settings.section.fleet'),
        subtitle: 'Warehouses and vehicles',
        icon: <Truck size={17} aria-hidden="true" />,
        iconClass: 'bg-amber-50 text-amber-600',
      },
      ...(isOwnerAdmin
        ? [
            {
              id: 'beats' as const,
              title: t('settings.section.beats'),
              subtitle: 'Routes (admin)',
              icon: <Compass size={17} aria-hidden="true" />,
              iconClass: 'bg-emerald-50 text-emerald-700',
            },
          ]
        : []),
      {
        id: 'staff',
        title: t('settings.section.staff'),
        subtitle: 'Logins and PINs',
        icon: <Users size={17} aria-hidden="true" />,
        iconClass: 'bg-slate-100 text-slate-700',
      },
      {
        id: 'display',
        title: t('settings.section.display'),
        subtitle: 'Text size, avatar, language',
        icon: <Palette size={17} aria-hidden="true" />,
        iconClass: 'bg-yellow-50 text-amber-600',
      },
      ...(isOwnerAdmin
        ? [
            {
              id: 'login' as const,
              title: 'Login page',
              subtitle: 'Brand and sign-in copy (admin)',
              icon: <Globe size={17} aria-hidden="true" />,
              iconClass: 'bg-indigo-50 text-indigo-600',
            },
          ]
        : []),
      {
        id: 'cloud',
        title: t('settings.section.cloud'),
        subtitle: 'Database and sync',
        icon: <Cloud size={17} aria-hidden="true" />,
        iconClass: 'bg-sky-50 text-sky-600',
      },
      {
        id: 'backups',
        title: t('settings.section.backups'),
        subtitle: 'Export, restore and reset',
        icon: <Database size={17} aria-hidden="true" />,
        iconClass: 'bg-slate-100 text-slate-600',
      },
    ];

    return (
      <div id="view-settings" className="hh-view w-full min-w-0">
        <div className="hh-sales-top hh-sales-top--flush">
          <div>
            <h1 className="hh-sales-top__title">Settings</h1>
            <p className="text-xs text-white/80 mt-0.5">Business, GST, billing rules, staff</p>
          </div>
        </div>

        <div className="space-y-3 hh-inv-pb">
          <div className="hh-inv-card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="size-11 rounded-full bg-[#2864d9] text-white font-extrabold text-base flex items-center justify-center shrink-0">
                <UserAvatar initial={ownerInitial} size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900 truncate">{ownerLabel}</div>
                {ownerSub && <div className="text-xs text-slate-500 truncate">{ownerSub}</div>}
              </div>
            </div>
            <span className="hh-set-badge-green shrink-0">{isOwnerAdmin ? 'Admin' : 'Staff'}</span>
          </div>

          <div className="hh-set-list">
            {homeItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMobileSection(item.id)}
                className="hh-set-row"
              >
                <span className={`hh-set-icon ${item.iconClass}`}>{item.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-extrabold text-slate-900">{item.title}</span>
                  <span className="block text-xs text-slate-500 truncate">{item.subtitle}</span>
                </span>
                <ChevronRight size={17} className="text-[#2864d9] shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        {renderPhoneToast()}
      </div>
    );
  }

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
          <div data-card-tone="sales" className="rounded-2xl border p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3.5 sm:mb-5 pb-3 border-b border-black/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue shrink-0">
                  <Building2 className="w-4 h-4" />
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 truncate">Business</h2>
              </div>
              <span className="hidden sm:inline text-xs font-medium text-blue-900/70">Organisation & Tax Profile</span>
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
          <div data-card-tone="profit" className="rounded-2xl border p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-3.5 sm:mb-5 pb-3 border-b border-black/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--purple shrink-0">
                  <Receipt className="w-4 h-4" />
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 truncate">Billing rules</h2>
              </div>
              <span className="hidden sm:inline text-xs font-medium text-purple-900/70">Invoicing, Taxes & Limits</span>
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
          <div data-card-tone="warning" className="rounded-2xl border p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-black/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber shrink-0">
                  <WarehouseIcon className="w-4 h-4" />
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 truncate">Warehouses &amp; vehicles</h2>
              </div>
              <span className="text-xs text-amber-900 bg-white/80 border border-black/5 px-2.5 py-0.5 rounded-full font-bold font-mono shrink-0">
                {warehouses.length} loc · {existingVehicles.length} veh
              </span>
            </div>

            {/* Live List from Database */}
            <div className="space-y-2 mb-5">
              {warehouses.map((wh) => {
                const isVeh = wh.notes?.includes('Vehicle') || wh.location.includes('Van') || wh.name.toLowerCase().includes('van');
                return (
                  <div
                    key={wh.id}
                    className="rounded-xl bg-white/85 border border-black/5 px-3 py-2.5 flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`hh-icon-badge hh-icon-badge--sm shrink-0 ${isVeh ? 'hh-icon-badge--amber' : 'hh-icon-badge--blue'}`}>
                        {isVeh ? <Truck className="w-4 h-4" /> : <WarehouseIcon className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-neutral-900 break-words">{wh.name}</span>
                          {wh.isDefault && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
                              Default
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-500 font-mono">
                          {isVeh ? `vehicle ${wh.code || ''}` : 'warehouse'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {warehouses.length > 1 && !wh.isDefault && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: `Delete ${wh.name}?`,
                              message: 'This removes it from the database. Bills and stock already recorded are not deleted.',
                              confirmLabel: 'Delete',
                              tone: 'danger',
                            });
                            if (!ok) return;
                            deleteWarehouse(wh.id);
                            setToastMessage(`Removed ${wh.name}`);
                            setTimeout(() => setToastMessage(null), 3000);
                          }}
                          className="text-neutral-400 hover:text-rose-600 transition-colors p-2 -m-1 cursor-pointer"
                          title="Remove from database"
                          aria-label={`Delete ${wh.name}`}
                        >
                          <X className="w-4 h-4" />
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
                  <div
                    key={'veh-' + idx}
                    className="rounded-xl bg-white/85 border border-black/5 px-3 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber shrink-0">
                        <Truck className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-bold text-neutral-900 truncate">{vehName}</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-mono shrink-0">vehicle</span>
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
          <div className="space-y-3">
            {/* Section Header Card */}
            <div data-card-tone="profit" className="rounded-2xl border p-4 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="hh-icon-badge hh-icon-badge--purple shrink-0">
                  <Users className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900">Staff &amp; roles</h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Manage owner access, salesman login numbers, and PINs.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white/85 border border-black/5 text-xs font-bold text-purple-900 tabular-nums shrink-0">
                {salesmen.length + 1} members
              </span>
            </div>

            {/* Authenticated Owner / Admin Card */}
            {(() => {
              const ownerLabel = currentUser?.username || profileForm.ownerName || 'dibyaprakashkcd5';
              const ownerEmail =
                currentUser && 'email' in currentUser
                  ? currentUser.email
                  : profileForm.email || 'dibyaprakashkcd5@gmail.com';
              return (
                <div
                  data-card-tone="profit"
                  className="rounded-2xl border p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="hh-avatar hh-avatar--purple shrink-0">
                      {getInitials(ownerLabel, 'O')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-[15px] font-extrabold text-slate-900 truncate">
                          {ownerLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-100/90 text-purple-800 text-[10px] font-bold uppercase tracking-wide shrink-0">
                          Owner
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 block mt-0.5 truncate">
                        {ownerEmail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 sm:self-center">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirmDialog({ title: 'Log out?', message: 'You will need to sign in again.', confirmLabel: 'Log out', tone: 'warning' });
                        if (ok && typeof logout === 'function') logout();
                      }}
                      className="min-h-[38px] px-3.5 rounded-xl border border-rose-200 bg-white/90 hover:bg-rose-50 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                      title="Sign out of account"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Database Salesmen & Staff Cards */}
            {salesmen.map((salesman) => (
              <div
                key={salesman.id}
                data-card-tone={salesman.active ? 'received' : 'neutral'}
                className="rounded-2xl border p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`hh-avatar shrink-0 ${salesman.active ? 'hh-avatar--green' : 'hh-avatar--slate'}`}>
                    {getInitials(salesman.name || 'S', 'S')}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-[15px] font-extrabold text-slate-900 truncate">
                        {salesman.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                          salesman.active
                            ? 'bg-emerald-100/90 text-emerald-800'
                            : 'bg-rose-100/90 text-rose-800'
                        }`}
                      >
                        {salesman.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 tabular-nums truncate font-medium">
                      {salesman.phone}
                      {salesman.defaultVehicle ? ` · ${salesman.defaultVehicle}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0 border-t border-black/5 sm:border-t-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleSalesmanActive(salesman.id)}
                    className={`min-h-[36px] px-3 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      salesman.active
                        ? 'border-black/10 bg-white/90 text-slate-700 hover:bg-white'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                    title="Toggle active status"
                  >
                    {salesman.active ? 'Switch off' : 'Switch on'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditStaff(salesman)}
                    className="min-h-[36px] px-3 rounded-xl border border-black/10 bg-white/90 hover:bg-white text-slate-700 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    title="Edit staff details"
                  >
                    <Pencil className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenSetPin(salesman)}
                    className="min-h-[36px] px-3 rounded-xl border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                    title="Set or reset this person's login PIN"
                  >
                    <Key className="w-3 h-3 shrink-0" />
                    <span>Set PIN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingStaff(salesman)}
                    className="ml-auto sm:ml-0 size-9 rounded-xl border border-transparent text-slate-400 hover:text-rose-600 hover:bg-white/90 inline-flex items-center justify-center cursor-pointer transition-colors shrink-0"
                    title="Remove staff member"
                    aria-label={`Remove ${salesman.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add Staff Member Form Card */}
            <div data-card-tone="sales" className="rounded-2xl border p-4 sm:p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-3">Add staff member</div>
              <form onSubmit={handleAddStaffMember} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  placeholder="Email or mobile number"
                  value={newStaffIdentifier}
                  onChange={(e) => setNewStaffIdentifier(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 shadow-2xs"
                />

                <div className="grid grid-cols-2 sm:flex gap-2.5">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    placeholder="PIN (4-6 digits)"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full sm:w-32 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 shadow-2xs"
                  />

                  <div className="relative w-full sm:w-32">
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 shadow-2xs cursor-pointer capitalize"
                    >
                      <option value="driver">driver</option>
                      <option value="salesman">salesman</option>
                      <option value="manager">manager</option>
                      <option value="accountant">accountant</option>
                      <option value="admin">admin</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newStaffIdentifier.trim() || newStaffPin.length < 4}
                  className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-xs disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  Add staff
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD 5: DISPLAY & ACCESSIBILITY                                          */}
        {/* ========================================================================= */}
        {activeSection === 'login' && currentUser?.role === 'admin' && <LoginPageEditor />}

        {activeSection === 'display' && (
          <div data-card-tone="sales" className="rounded-2xl border p-3.5 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-black/5">
              <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue shrink-0">
                <Eye className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900">{t('settings.display.title')}</h2>
                <p className="hidden sm:block text-xs text-neutral-600 mt-0.5">
                  {t('settings.display.subtitle')}
                </p>
              </div>
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
          <div
            data-card-tone={supabaseStatus.isConnected ? 'received' : 'warning'}
            className="rounded-2xl border p-3.5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-black/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`hh-icon-badge hh-icon-badge--sm shrink-0 ${supabaseStatus.isConnected ? 'hh-icon-badge--green' : 'hh-icon-badge--amber'}`}>
                  <Cloud className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 truncate">Database &amp; Cloud Sync</h2>
                  <p className="hidden sm:block text-xs text-neutral-600 mt-0.5">
                    Real-time PostgreSQL replication, offline resilience, and ledger state.
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                  supabaseStatus.isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}
              >
                {supabaseStatus.isConnected ? 'Cloud Connected' : 'Offline Mode'}
              </span>
            </div>

            <div className="p-3.5 bg-white/85 rounded-xl border border-black/5 text-xs space-y-2">
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
                  const ok = await confirmDialog({
                    title: 'Re-send everything to the cloud?',
                    message:
                      'This rewrites every record and uses a lot of database activity. Only needed after restoring or changing the database. "Push Changes to Cloud" sends just what changed.',
                    confirmLabel: 'Re-send everything',
                    tone: 'warning',
                  });
                  if (!ok) return;
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
          <div data-card-tone="neutral" className="rounded-2xl border p-3.5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-black/5">
              <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--slate shrink-0">
                <Database className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900">Data &amp; Backups</h2>
                <p className="hidden sm:block text-xs text-neutral-600 mt-0.5">
                  Download snapshots of your business ledger or import a JSON backup.
                </p>
              </div>
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

            {/* Danger Operations (owner only; each one shows exactly what goes, offers a backup and asks for a typed word) */}
            {currentUser?.role === 'admin' ? (
              <div className="pt-4 border-t border-neutral-100">
                <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Danger Operations</h3>
                <p className="text-xs text-neutral-500 mb-2.5">
                  These cannot be undone. Each one asks you to download a backup and type a word first.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Clear all bills, payments and trips?',
                        message:
                          'This deletes every transaction record on this device and in the cloud. Your products, customers, GRNs, stock batches and company settings are kept.',
                        details: [
                          `${bills.length} bills`,
                          `${payments.length} payments / receipts`,
                          `${trips.length} vehicle trips`,
                          `${audits.length} stock audits`,
                          `${stockTransfers.length} stock transfers`,
                        ],
                        confirmLabel: 'Clear records',
                        tone: 'danger',
                        typeToConfirm: 'CLEAR',
                        extraAction: { label: 'Download a backup file first', onClick: () => exportBackup() },
                      });
                      if (!ok) return;
                      clearTransactions();
                      setToastMessage('Bills, payments and trips cleared.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="px-3.5 py-2.5 min-h-[44px] border border-amber-300 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Clear Bills, Payments & Trips
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Factory reset: erase everything?',
                        message:
                          'This deletes all business data and puts the company profile and billing / GST settings back to defaults.',
                        details: [
                          `${bills.length} bills and ${payments.length} payments`,
                          `${customers.length} customers`,
                          `${products.length} products`,
                          `${grns.length} GRNs (purchases)`,
                          `${warehouses.length} warehouses / vehicles (reset to the default one)`,
                          'Company profile and billing / GST settings',
                        ],
                        confirmLabel: 'Erase everything',
                        tone: 'danger',
                        typeToConfirm: 'RESET',
                        extraAction: { label: 'Download a backup file first', onClick: () => exportBackup() },
                      });
                      if (!ok) return;
                      resetToDefault();
                      setToastMessage('Ledger reset to defaults.');
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="px-3.5 py-2.5 min-h-[44px] border border-rose-300 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    Factory Reset
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-xs text-neutral-500">Clearing or resetting data can only be done by the owner.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* IN-APP MODAL: EDIT STAFF DETAILS                                          */}
      {/* ========================================================================= */}
      {editingStaff && (
        <div role="dialog" aria-modal="true" aria-label="Edit staff details" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
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
        <div role="dialog" aria-modal="true" aria-label="Set security PIN" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
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
        <div role="dialog" aria-modal="true" aria-label="Remove staff member" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
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
