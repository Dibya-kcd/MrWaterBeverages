import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UserPlus,
  Building2,
  Phone,
  MapPin,
  FileText,
  IndianRupee,
  Mic,
  MicOff,
  CheckCircle2,
  AlertCircle,
  Truck,
  User,
} from 'lucide-react';
import { Customer } from '../../types';
import { useLedger } from '../../context/LedgerContext';
import { useBeats } from '../../hooks/useBeats';
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  speakAssistiveText,
  ActiveSpeechSession,
} from '../../utils/speechRecognition';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  initialPhone?: string;
  defaultRoute?: string;
  onCustomerCreated?: (customer: Customer) => void;
  title?: string;
  isLowVision?: boolean;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  initialPhone = '',
  defaultRoute = '',
  onCustomerCreated,
  title = 'Add New Customer / Retailer',
  isLowVision = false,
}) => {
  const { addCustomer, palette, customers: registeredCustomers } = useLedger();
  const { activeBeats, myBeats } = useBeats();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [route, setRoute] = useState('');
  const [gstin, setGstin] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [creditLimit, setCreditLimit] = useState('0');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voice speech state
  const [isListening, setIsListening] = useState(false);
  const [listeningTarget, setListeningTarget] = useState<'name' | 'phone' | null>(null);
  const speechSessionRef = useRef<ActiveSpeechSession | null>(null);

  // Prepopulate initial values when opened
  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setPhone(initialPhone || '');
      setContactPerson('');
      setAddress('');
      // a salesman's new shop goes into his own beat by default
      setRoute(defaultRoute || myBeats[0]?.name || (activeBeats[0]?.name ? activeBeats[0].name : ''));
      setGstin('');
      setOpeningBalance('0');
      setCreditLimit('0');
      setNotes('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialName, initialPhone, defaultRoute, activeBeats, myBeats]);

  useEffect(() => {
    return () => {
      if (speechSessionRef.current) {
        speechSessionRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleVoiceInput = (target: 'name' | 'phone') => {
    if (isListening && listeningTarget === target) {
      if (speechSessionRef.current) {
        speechSessionRef.current.stop();
      }
      setIsListening(false);
      setListeningTarget(null);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setErrorMsg('Voice recognition not supported in this browser.');
      return;
    }

    setIsListening(true);
    setListeningTarget(target);
    speakAssistiveText(`Listening for ${target === 'name' ? 'customer or shop name' : 'phone number'}`);

    speechSessionRef.current = startSpeechRecognition({
      onStart: () => setIsListening(true),
      onResult: (transcript) => {
        setIsListening(false);
        setListeningTarget(null);
        if (target === 'name') {
          setName(transcript.trim());
          speakAssistiveText(`Name: ${transcript}`);
        } else {
          // Keep only digits
          const cleanPhone = transcript.replace(/[^0-9]/g, '');
          setPhone(cleanPhone.slice(-10));
          speakAssistiveText(`Phone: ${cleanPhone}`);
        }
      },
      onError: (err) => {
        setIsListening(false);
        setListeningTarget(null);
        setErrorMsg(`Microphone: ${err}`);
      },
      onEnd: () => {
        setIsListening(false);
        setListeningTarget(null);
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();

    if (!cleanName) {
      setErrorMsg('Please enter the customer / shop name.');
      speakAssistiveText('Customer name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const cleanPhone = phone.trim();
      const cleanAddress = address.trim();
      const cleanRoute = route.trim();
      const cleanGstin = gstin.trim().toUpperCase();
      const openBal = parseFloat(openingBalance) || 0;
      const credLim = parseFloat(creditLimit) || 0;

      const noteParts = [
        contactPerson.trim() && `Contact: ${contactPerson.trim()}`,
        notes.trim(),
      ].filter(Boolean);

      const knownIds = new Set((registeredCustomers || []).map((c) => c.id));
      const newCustomer = addCustomer({
        name: cleanName,
        phone: cleanPhone,
        address: cleanAddress || undefined,
        city: cleanRoute || undefined,
        route: cleanRoute || undefined,
        beatId: activeBeats.find((b) => b.name === cleanRoute)?.id,
        gstin: cleanGstin || undefined,
        openingBalance: openBal,
        creditLimit: credLim,
        notes: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
      });

      speakAssistiveText(
        knownIds.has(newCustomer.id)
          ? `${newCustomer.name} is already registered. Existing customer selected.`
          : `New customer ${newCustomer.name} created.`,
      );

      if (onCustomerCreated) {
        onCustomerCreated(newCustomer);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92dvh] max-h-[92svh] flex flex-col rounded-2xl shadow-2xl border-2 bg-white text-slate-900 overflow-hidden"
        style={{ borderColor: palette?.line || '#0f172a' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-modal-title"
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <UserPlus size={20} className="text-emerald-400" />
            </div>
            <div>
              <h3
                id="add-customer-modal-title"
                className="font-black text-base sm:text-lg text-slate-900 leading-tight"
              >
                {title}
              </h3>
              <p className="hidden sm:block text-xs text-slate-500 font-medium">
                Register shop into customer master & route ledger
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs sm:text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Customer / Shop Name Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
              Shop / Customer Name <span className="text-rose-600">*</span>
            </label>
            <div className="relative flex items-center">
              <Building2 size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maa Durga General Store"
                className="w-full pl-10 pr-12 py-2.5 rounded-xl border-2 border-slate-300 font-extrabold text-sm sm:text-base text-slate-900 focus:outline-none focus:border-slate-900 bg-white shadow-xs"
              />
              <button
                type="button"
                onClick={() => handleVoiceInput('name')}
                title="Speak shop name"
                className={`absolute right-2 p-1.5 rounded-lg border cursor-pointer transition-colors ${
                  isListening && listeningTarget === 'name'
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                }`}
              >
                {isListening && listeningTarget === 'name' ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          {/* Mobile / Phone Number Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
              Mobile / Phone Number
            </label>
            <div className="relative flex items-center">
              <Phone size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile (for WhatsApp bill & ledger)"
                className="w-full pl-10 pr-12 py-2.5 rounded-xl border-2 border-slate-300 font-bold font-mono text-sm sm:text-base text-slate-900 focus:outline-none focus:border-slate-900 bg-white shadow-xs"
              />
              <button
                type="button"
                onClick={() => handleVoiceInput('phone')}
                title="Speak mobile number"
                className={`absolute right-2 p-1.5 rounded-lg border cursor-pointer transition-colors ${
                  isListening && listeningTarget === 'phone'
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                }`}
              >
                {isListening && listeningTarget === 'phone' ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          {/* Contact Person & Route in 2-Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Contact Person
              </label>
              <div className="relative flex items-center">
                <User size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Owner / Manager name"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-bold text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900 bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Route / Beat
              </label>
              <div className="relative flex items-center">
                <Truck size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  list="route-beat-suggestions"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="e.g. Market Route / Beat A"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-bold text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900 bg-white"
                />
                <datalist id="route-beat-suggestions">
                  {activeBeats.map((b) => (
                    <option key={b.name} value={b.name} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Address / Landmark */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
              Shop Address / Landmark
            </label>
            <div className="relative flex items-start">
              <MapPin size={18} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop number, market, near temple/school..."
                className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-medium text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900 bg-white"
              />
            </div>
          </div>

          {/* GSTIN & Opening Balance Accordion/Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                GSTIN (Optional)
              </label>
              <div className="relative flex items-center">
                <FileText size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="15-digit GSTIN"
                  maxLength={15}
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-slate-900 bg-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Opening Balance Due (₹)
              </label>
              <div className="relative flex items-center">
                <IndianRupee size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  type="number" inputMode="decimal"
                  step="any"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-slate-900 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-[0.99]"
            >
              <UserPlus size={16} />
              <span>{isSubmitting ? 'Saving...' : 'Save & Select Customer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
