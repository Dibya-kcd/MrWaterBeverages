import React, { useState } from 'react';
import {
  UserCheck,
  UserX,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  Truck,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Receipt,
  FileSpreadsheet,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Salesman } from '../../types';

export const SalesmenManagementSection: React.FC = () => {
  const {
    palette,
    fz,
    salesmen,
    addSalesman,
    updateSalesman,
    toggleSalesmanActive,
    deleteSalesman,
    trips,
    bills,
    syncToCloud,
  } = useLedger();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSalesman, setEditingSalesman] = useState<Salesman | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formVehicle, setFormVehicle] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // List of distinct existing vehicles for quick autocomplete
  const knownVehicles = Array.from(
    new Set([
      'Tata Ace - MH-14-GH-1234',
      'Mahindra Bolero Maxi Truck',
      'Ashok Leyland Dost',
      'Maruti Super Carry',
      ...trips.map((t) => t.vehicle).filter(Boolean),
      ...salesmen.map((s) => s.defaultVehicle || s.default_vehicle).filter(Boolean),
    ])
  ) as string[];

  const handleOpenAdd = () => {
    setEditingSalesman(null);
    setFormName('');
    setFormPhone('');
    setFormVehicle('');
    setFormPin('');
    setFormActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sm: Salesman) => {
    setEditingSalesman(sm);
    setFormName(sm.name);
    setFormPhone(sm.phone);
    setFormVehicle(sm.defaultVehicle || sm.default_vehicle || '');
    setFormPin(''); // blank unless resetting PIN
    setFormActive(sm.active !== false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSalesman(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      if (editingSalesman) {
        // Edit existing salesman
        const res = await updateSalesman(
          editingSalesman.id,
          {
            name: formName.trim(),
            phone: formPhone.trim(),
            defaultVehicle: formVehicle.trim(),
            active: formActive,
          },
          formPin.trim() ? formPin.trim() : undefined
        );

        if (!res.success) {
          setFormError(res.error || 'Failed to update salesman.');
          setFormLoading(false);
          return;
        }

        setSuccessMessage(`Salesman "${formName}" updated successfully.`);
      } else {
        // Add new salesman
        if (!formPin.trim()) {
          setFormError('Please enter a 4-to-6 digit security PIN for the new salesman.');
          setFormLoading(false);
          return;
        }

        const res = await addSalesman(
          {
            name: formName.trim(),
            phone: formPhone.trim(),
            defaultVehicle: formVehicle.trim(),
            active: formActive,
          },
          formPin.trim()
        );

        if (!res.success) {
          setFormError(res.error || 'Failed to create salesman.');
          setFormLoading(false);
          return;
        }

        setSuccessMessage(`New salesman "${formName}" added successfully with encrypted PIN.`);
      }

      handleCloseModal();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err?.message || 'An unexpected error occurred.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (sm: Salesman) => {
    const tripCount = trips.filter((t) => t.salesmanId === sm.id || t.salesman === sm.name).length;
    const billCount = bills.filter((b) => b.salesmanId === sm.id || b.salesman === sm.name).length;

    const warning =
      tripCount > 0 || billCount > 0
        ? `This salesman has ${tripCount} trip(s) and ${billCount} bill(s) recorded. Instead of deleting, it is recommended to deactivate them to preserve historical audit logs. Are you sure you want to permanently delete?`
        : `Are you sure you want to delete salesman "${sm.name}"?`;

    if (window.confirm(warning)) {
      deleteSalesman(sm.id);
      setSuccessMessage(`Salesman "${sm.name}" was removed.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Filtered salesmen
  const filteredSalesmen = salesmen.filter((sm) => {
    const matchSearch =
      sm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sm.phone.includes(searchQuery) ||
      (sm.defaultVehicle || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    if (filterActive === 'active') return sm.active !== false;
    if (filterActive === 'inactive') return sm.active === false;
    return true;
  });

  const activeCount = salesmen.filter((s) => s.active !== false).length;
  const inactiveCount = salesmen.length - activeCount;

  return (
    <div id="salesmen-management-section" className="space-y-6">
      {/* Top Banner & Metric Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <UserCheck size={24} className="text-blue-900" />
            <span>Field Salesmen &amp; Route Accounts</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Provision field staff with phone numbers, assigned delivery vans, and hashed PIN security for restricted mobile billing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-add-salesman"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>Add New Salesman</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border-2 bg-white shadow-xs" style={{ borderColor: palette.line }}>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Salesmen</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{salesmen.length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Admin-provisioned personnel</div>
        </div>
        <div className="p-4 rounded-xl border-2 bg-white shadow-xs" style={{ borderColor: palette.line }}>
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Active on Route</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Can login &amp; create bills</div>
        </div>
        <div className="p-4 rounded-xl border-2 bg-white shadow-xs" style={{ borderColor: palette.line }}>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Inactive / Deactivated</div>
          <div className="text-2xl font-black text-slate-600 mt-1">{inactiveCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Login blocked, past history kept</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            id="input-search-salesmen"
            placeholder="Search by name, phone, or van..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border-2 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-900 bg-white"
            style={{ borderColor: palette.line, color: palette.ink }}
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['all', 'active', 'inactive'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              id={`filter-salesmen-${filter}`}
              onClick={() => setFilterActive(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                filterActive === filter
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 border hover:bg-slate-50'
              }`}
              style={{ borderColor: filterActive === filter ? palette.navy : palette.line }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Salesmen Table */}
      <div className="bg-white border-2 rounded-2xl overflow-hidden shadow-sm" style={{ borderColor: palette.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 text-slate-600 uppercase font-black tracking-wider text-[11px]" style={{ borderColor: palette.line }}>
                <th className="py-3 px-4">Salesman Name</th>
                <th className="py-3 px-4">Login Phone</th>
                <th className="py-3 px-4">Assigned Delivery Van</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Route History</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredSalesmen.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-semibold">
                    No salesmen found matching your filter.
                  </td>
                </tr>
              ) : (
                filteredSalesmen.map((sm) => {
                  const smTrips = trips.filter((t) => t.salesmanId === sm.id || t.salesman === sm.name);
                  const smBills = bills.filter((b) => b.salesmanId === sm.id || b.salesman === sm.name);
                  const isActive = sm.active !== false;

                  return (
                    <tr
                      key={sm.id}
                      id={`salesman-row-${sm.id}`}
                      className={`hover:bg-slate-50/70 transition-colors ${!isActive ? 'bg-slate-50/40 text-slate-500' : ''}`}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                            isActive ? 'bg-blue-100 text-blue-900' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {sm.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div>{sm.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">ID: {sm.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-400" />
                          <span>{sm.phone}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        {sm.defaultVehicle || sm.default_vehicle ? (
                          <div className="flex items-center gap-1.5">
                            <Truck size={14} className="text-amber-600 shrink-0" />
                            <span className="font-semibold">{sm.defaultVehicle || sm.default_vehicle}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None assigned</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          id={`toggle-active-${sm.id}`}
                          onClick={() => toggleSalesmanActive(sm.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          }`}
                          title="Click to toggle active/deactivated state"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span>{isActive ? 'Active' : 'Deactivated'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="flex items-center gap-3 text-[11px]">
                          <span title={`${smTrips.length} total vehicle trips`} className="flex items-center gap-1">
                            <Truck size={12} className="text-slate-400" />
                            <strong>{smTrips.length}</strong> trips
                          </span>
                          <span title={`${smBills.length} invoices generated`} className="flex items-center gap-1">
                            <Receipt size={12} className="text-slate-400" />
                            <strong>{smBills.length}</strong> bills
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            id={`edit-salesman-${sm.id}`}
                            onClick={() => handleOpenEdit(sm)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-900 hover:border-blue-300 transition-colors cursor-pointer"
                            title="Edit details / Reset PIN"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            id={`delete-salesman-${sm.id}`}
                            onClick={() => handleDelete(sm)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors cursor-pointer"
                            title="Delete salesman"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & RLS Architectural Note for Depot Owner */}
      <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <ShieldCheck size={20} className="text-blue-900 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-900">
            Cryptographic PIN Hashing &amp; Supabase RLS Security Policy
          </div>
          <p>
            Salesman PINs are hashed using the Web Crypto API (SHA-256 with a unique depot salt) before transmission and storage. Plaintext PINs are never stored in the database. Deactivating a salesman immediately revokes mobile login access while safely preserving all historical bills and trip reconciliation records.
          </p>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div
          id="modal-salesman-editor"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="w-full max-w-md bg-white border-2 rounded-2xl shadow-2xl p-6 space-y-4"
            style={{ borderColor: palette.navy }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <UserCheck size={18} className="text-blue-900" />
                <span>{editingSalesman ? 'Edit Salesman Account' : 'Register New Salesman'}</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Full Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Salesman Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                  style={{ borderColor: palette.line }}
                />
              </div>

              {/* Login Phone */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mobile Number (Login Identifier) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                  style={{ borderColor: palette.line }}
                />
              </div>

              {/* Default Delivery Vehicle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Default Delivery Vehicle (Optional)
                </label>
                <input
                  type="text"
                  list="known-vehicles-list"
                  placeholder="e.g. Tata Ace - MH-14-GH-1234"
                  value={formVehicle}
                  onChange={(e) => setFormVehicle(e.target.value)}
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                  style={{ borderColor: palette.line }}
                />
                <datalist id="known-vehicles-list">
                  {knownVehicles.map((v, i) => (
                    <option key={i} value={v} />
                  ))}
                </datalist>
              </div>

              {/* 4 to 6 Digit PIN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    {editingSalesman ? 'Reset Security PIN (Leave blank to keep current)' : 'Security PIN (4 to 6 Digits) *'}
                  </label>
                  <KeyRound size={14} className="text-amber-500" />
                </div>
                <input
                  type="password"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder={editingSalesman ? 'Enter new 4-6 digit PIN to reset' : 'Enter 4-6 digit numeric PIN'}
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-900"
                  style={{ borderColor: palette.line }}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  PIN is hashed cryptographically using SHA-256 before saving.
                </p>
              </div>

              {/* Active Account Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="checkbox-form-active"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 text-blue-900 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="checkbox-form-active" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Account Active (allows mobile app sign-in)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : editingSalesman ? 'Update Salesman' : 'Create Salesman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
