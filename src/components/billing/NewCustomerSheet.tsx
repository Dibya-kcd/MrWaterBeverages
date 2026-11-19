import React from 'react';
import { X } from 'lucide-react';
import { validatePhone } from '../../utils/validation';

/**
 * "New Customer / Shop" form. Bottom sheet below 768px, centred modal from 768px up.
 * Purely presentational: the parent keeps the field state and the save handler
 * (handleSaveNewCustomer), so nothing about how a customer is saved has changed.
 */
export interface NewCustomerSheetProps {
  name: string;
  onNameChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  gstin: string;
  onGstinChange: (v: string) => void;
  address: string;
  onAddressChange: (v: string) => void;
  beat: string;
  onBeatChange: (v: string) => void;
  activeBeats: { id: string; name: string }[];
  onSave: () => void;
  onClose: () => void;
}

const inputCls =
  'w-full min-h-[44px] px-3.5 rounded-xl border border-gray-300 bg-white text-base text-[#0A1F44] focus:outline-none focus:border-[#1B8A5A] focus:ring-2 focus:ring-[#1B8A5A]/20';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

export const NewCustomerSheet: React.FC<NewCustomerSheetProps> = ({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  gstin,
  onGstinChange,
  address,
  onAddressChange,
  beat,
  onBeatChange,
  activeBeats,
  onSave,
  onClose,
}) => {
  const phoneErr = phone.trim() ? validatePhone(phone, { label: 'Phone number' }) : null;
  return (
  <div
    data-esc-close
    role="dialog"
    aria-modal="true"
    aria-label="New customer"
    className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center md:justify-center md:p-4"
    onClick={onClose}
  >
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !phoneErr) onSave();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded-t-2xl md:max-w-xl md:rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <h3 className="font-bold text-[#0A1F44] text-base">New Customer / Shop</h3>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div>
          <label htmlFor="ncs-name" className={labelCls}>
            Customer / Shop Name *
          </label>
          <input
            id="ncs-name"
            type="text"
            autoFocus
            placeholder="e.g. Northside Traders"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ncs-phone" className={labelCls}>
              Phone Number
            </label>
            <input
              id="ncs-phone"
              type="tel"
              inputMode="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className={`${inputCls} ${phoneErr ? 'border-rose-400 focus:border-rose-500' : ''}`}
            />
            {phoneErr && <p className="mt-1 text-[11px] font-medium text-rose-600">{phoneErr}</p>}
          </div>
          <div>
            <label htmlFor="ncs-gstin" className={labelCls}>
              GSTIN (optional)
            </label>
            <input
              id="ncs-gstin"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              type="text"
              placeholder="e.g. 27ABCDE1234F1Z5"
              value={gstin}
              onChange={(e) => onGstinChange(e.target.value.toUpperCase())}
              className={`${inputCls} uppercase`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="ncs-beat" className={labelCls}>
            Route / Beat
          </label>
          <select
            id="ncs-beat"
            value={beat}
            onChange={(e) => onBeatChange(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">-- Select Beat / Route --</option>
            {activeBeats.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          {activeBeats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {activeBeats.slice(0, 6).map((b) => {
                const on = beat.toLowerCase() === b.name.toLowerCase();
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onBeatChange(b.name)}
                    className={`min-h-[44px] px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      on
                        ? 'bg-[#1B8A5A] text-white border-[#1B8A5A]'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="ncs-address" className={labelCls}>
            Address (optional)
          </label>
          <input
            id="ncs-address"
            type="text"
            placeholder="Shop location / route"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer shrink-0"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !!phoneErr}
          className="flex-1 min-h-[44px] rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Save & Start Order →
        </button>
      </div>
    </form>
  </div>
  );
};
