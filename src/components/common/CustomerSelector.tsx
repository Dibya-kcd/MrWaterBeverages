import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  UserCheck,
  Phone,
  Receipt,
  X,
  Clock,
  AlertCircle,
  CheckCircle2,
  Mic,
  MicOff,
  Volume2,
  Zap,
} from 'lucide-react';
import { ExistingCustomer } from '../../types';
import { money } from '../../utils/billing';
import {
  startSpeechRecognition,
  isSpeechRecognitionSupported,
  speakAssistiveText,
  ActiveSpeechSession,
} from '../../utils/speechRecognition';

interface CustomerSelectorProps {
  customers: ExistingCustomer[];
  onSelect: (c: ExistingCustomer) => void;
  onClose: () => void;
  palette: any;
  scale: number;
  currentRetailer?: string;
}

const ALPHABET_GROUPS = [
  { label: 'ALL', min: 'A', max: 'Z' },
  { label: 'A - D', min: 'A', max: 'D' },
  { label: 'E - H', min: 'E', max: 'H' },
  { label: 'I - L', min: 'I', max: 'L' },
  { label: 'M - P', min: 'M', max: 'P' },
  { label: 'Q - T', min: 'Q', max: 'T' },
  { label: 'U - Z', min: 'U', max: 'Z' },
];

export const CustomerSelector: React.FC<CustomerSelectorProps> = ({
  customers,
  onSelect,
  onClose,
  palette,
  scale,
  currentRetailer = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeAlphaGroup, setActiveAlphaGroup] = useState('ALL');
  const [isListening, setIsListening] = useState(false);
  const [speechFeedback, setSpeechFeedback] = useState<string | null>(null);
  const [highContrastMode, setHighContrastMode] = useState(false);
  const speechSessionRef = useRef<ActiveSpeechSession | null>(null);

  // Stop speech session on unmount
  useEffect(() => {
    return () => {
      if (speechSessionRef.current) {
        speechSessionRef.current.abort();
      }
    };
  }, []);

  const handleToggleVoiceSearch = () => {
    if (isListening) {
      if (speechSessionRef.current) {
        speechSessionRef.current.stop();
      }
      setIsListening(false);
      setSpeechFeedback(null);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setSpeechFeedback('Voice recognition not supported in this browser.');
      speakAssistiveText('Voice recognition not supported in this browser.');
      return;
    }

    setSpeechFeedback('Listening... Please speak the customer or shop name.');
    speakAssistiveText('Listening. Speak customer name now.');
    setIsListening(true);

    speechSessionRef.current = startSpeechRecognition({
      onStart: () => {
        setIsListening(true);
      },
      onResult: (transcript) => {
        setIsListening(false);
        setSearchTerm(transcript);
        setSpeechFeedback(`Recognized: "${transcript}"`);
        speakAssistiveText(`Found: ${transcript}`);
      },
      onError: (err) => {
        setIsListening(false);
        setSpeechFeedback(`Microphone notice: ${err}`);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const filtered = useMemo(() => {
    let list = customers;

    // Alphabet group filtering
    if (activeAlphaGroup !== 'ALL') {
      const group = ALPHABET_GROUPS.find((g) => g.label === activeAlphaGroup);
      if (group) {
        list = list.filter((c) => {
          const firstChar = c.name.trim().charAt(0).toUpperCase();
          return firstChar >= group.min && firstChar <= group.max;
        });
      }
    }

    // Search query filtering (by name or phone digits)
    const q = searchTerm.toLowerCase().trim();
    if (!q) return list;

    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [customers, searchTerm, activeAlphaGroup]);

  // Handle Spot Cash selection (1-tap)
  const handleSelectCash = () => {
    speakAssistiveText('Selected Walk-in Cash Retailer');
    onSelect({
      name: 'Cash Sale / Walk-in Retailer',
      phone: '',
      totalBills: 0,
      totalBilled: 0,
      totalPaid: 0,
      balanceDue: 0,
      lastBillDate: '',
    });
    onClose();
  };

  const handleSelectCustomer = (c: ExistingCustomer) => {
    speakAssistiveText(`Selected ${c.name}`);
    onSelect(c);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[92dvh] max-h-[92svh] flex flex-col rounded-xl shadow-2xl border-3 overflow-hidden ${
          highContrastMode
            ? 'bg-black text-yellow-300 border-yellow-400'
            : 'bg-white text-stone-900'
        }`}
        style={
          highContrastMode
            ? {}
            : {
                borderColor: palette.accent || '#1e3a8a',
                backgroundColor: palette.cardBg || '#ffffff',
                color: palette.text,
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          className={`px-5 py-3.5 flex items-center justify-between border-b-2 ${
            highContrastMode ? 'border-yellow-400 bg-black' : ''
          }`}
          style={
            highContrastMode
              ? {}
              : { borderColor: palette.border, backgroundColor: palette.bg }
          }
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-black shadow-xs ${
                highContrastMode ? 'bg-yellow-400 text-black' : 'text-white'
              }`}
              style={highContrastMode ? {} : { backgroundColor: palette.accent }}
            >
              <UserCheck size={22} />
            </div>
            <div>
              <h3
                className="font-black text-lg sm:text-xl tracking-tight leading-tight"
                style={highContrastMode ? { color: '#facc15' } : { color: palette.text }}
              >
                Select Customer / Retailer
              </h3>
              <p
                className={`text-xs ${
                  highContrastMode ? 'text-yellow-200' : 'opacity-70'
                }`}
              >
                Voice-assisted customer selection • {customers.length} registered retailer{customers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* High Contrast Accessibility Toggle */}
            <button
              type="button"
              onClick={() => {
                setHighContrastMode(!highContrastMode);
                speakAssistiveText(
                  !highContrastMode
                    ? 'High accessibility contrast enabled'
                    : 'Standard contrast enabled'
                );
              }}
              className={`px-2.5 py-1 text-xs font-black rounded border-2 cursor-pointer transition-colors ${
                highContrastMode
                  ? 'bg-yellow-400 text-black border-yellow-300'
                  : 'bg-slate-100 text-black border-black hover:bg-slate-200'
              }`}
              title="Toggle Large High-Contrast View for Low Vision"
            >
              {highContrastMode ? 'Standard' : '👁️ High Contrast'}
            </button>

            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                highContrastMode
                  ? 'text-yellow-400 hover:bg-stone-900'
                  : 'hover:bg-stone-200/60'
              }`}
              style={highContrastMode ? {} : { color: palette.muted }}
              title="Close dialog"
              id="close-customer-selector-modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 1-Tap Spot Cash Customer Quick Button */}
        <div
          className={`px-4 pt-3 pb-2 border-b ${
            highContrastMode ? 'border-yellow-400/40 bg-zinc-950' : 'bg-amber-50/50'
          }`}
        >
          <button
            type="button"
            onClick={handleSelectCash}
            className={`w-full py-3 px-4 rounded-lg font-black text-sm sm:text-base border-2 flex items-center justify-between shadow-xs transition-transform active:scale-[0.99] cursor-pointer ${
              highContrastMode
                ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                : 'bg-amber-100 text-amber-950 border-amber-400 hover:bg-amber-200'
            }`}
            style={{ minHeight: '52px' }}
            id="btn-select-cash-customer-quick"
          >
            <div className="flex items-center gap-2">
              <Zap size={20} className={highContrastMode ? 'text-black' : 'text-amber-700'} />
              <span>Spot Cash Sale / Walk-in Customer</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/10">
              1-Tap Select
            </span>
          </button>
        </div>

        {/* Search Bar & Voice Input */}
        <div
          className={`p-3 sm:p-4 border-b space-y-3 ${
            highContrastMode ? 'border-yellow-400 bg-black' : ''
          }`}
          style={highContrastMode ? {} : { borderColor: palette.border }}
        >
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                size={18}
                className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
                  highContrastMode ? 'text-yellow-400' : 'opacity-50'
                }`}
              />
              <input
                type="text"
                autoFocus
                placeholder="Type name, phone, or tap mic to speak..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-16 py-3 rounded-lg text-base font-bold border-2 transition-all focus:outline-none focus:ring-3 ${
                  highContrastMode
                    ? 'bg-zinc-900 text-yellow-300 border-yellow-400 placeholder-yellow-600 focus:ring-yellow-400'
                    : 'border-slate-300 bg-slate-50 focus:ring-blue-400'
                }`}
                style={{ minHeight: '50px' }}
                id="customer-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSpeechFeedback(null);
                  }}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2 py-1 rounded cursor-pointer ${
                    highContrastMode
                      ? 'bg-yellow-400 text-black'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Voice Search Button (Large & Accessible) */}
            <button
              type="button"
              onClick={handleToggleVoiceSearch}
              className={`px-4 py-3 rounded-lg font-black text-sm border-2 flex items-center gap-2 cursor-pointer shadow-sm transition-all ${
                isListening
                  ? 'bg-red-600 text-white border-red-700 animate-pulse ring-4 ring-red-400'
                  : highContrastMode
                  ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                  : 'bg-blue-900 text-white border-blue-950 hover:bg-blue-800'
              }`}
              style={{ minHeight: '50px' }}
              title="Tap to speak retailer or customer name"
              id="btn-voice-search-customer"
            >
              {isListening ? (
                <>
                  <MicOff size={20} />
                  <span className="hidden sm:inline">Listening...</span>
                </>
              ) : (
                <>
                  <Mic size={20} />
                  <span className="hidden sm:inline">Speak</span>
                </>
              )}
            </button>
          </div>

          {/* Voice Feedback Banner */}
          {speechFeedback && (
            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between text-xs sm:text-sm font-bold ${
                isListening
                  ? 'bg-red-50 text-red-900 border-red-300'
                  : highContrastMode
                  ? 'bg-zinc-900 text-yellow-300 border-yellow-400'
                  : 'bg-blue-50 text-blue-900 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Volume2 size={16} />
                <span>{speechFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setSpeechFeedback(null)}
                className="text-xs underline opacity-80 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Alphabet Quick Filter Jump Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {ALPHABET_GROUPS.map((g) => {
              const isCurrent = activeAlphaGroup === g.label;
              return (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => {
                    setActiveAlphaGroup(g.label);
                    speakAssistiveText(`Filter: ${g.label}`);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-black whitespace-nowrap cursor-pointer transition-colors border ${
                    isCurrent
                      ? highContrastMode
                        ? 'bg-yellow-400 text-black border-yellow-300 shadow-sm'
                        : 'bg-blue-900 text-white border-blue-950 shadow-sm'
                      : highContrastMode
                      ? 'bg-zinc-900 text-yellow-200 border-yellow-500 hover:bg-zinc-800'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                  style={{ minHeight: '38px', minWidth: '46px' }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer List with High Visibility Cards */}
        <div
          className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 ${
            highContrastMode ? 'bg-black' : ''
          }`}
        >
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle
                size={40}
                className={`mx-auto mb-2 ${
                  highContrastMode ? 'text-yellow-400' : 'opacity-40'
                }`}
              />
              <p className="font-black text-base sm:text-lg">
                No customer found matching &quot;{searchTerm}&quot;
              </p>
              <p
                className={`text-xs sm:text-sm mt-1.5 ${
                  highContrastMode ? 'text-yellow-200' : 'opacity-70'
                }`}
              >
                You can tap &quot;Use as New Customer&quot; below or type on the invoice.
              </p>

              {searchTerm.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectCustomer({
                      name: searchTerm.trim(),
                      phone: '',
                      totalBills: 0,
                      totalBilled: 0,
                      totalPaid: 0,
                      balanceDue: 0,
                      lastBillDate: '',
                    });
                  }}
                  className={`mt-4 px-5 py-2.5 rounded-lg font-black text-sm border-2 cursor-pointer shadow-md ${
                    highContrastMode
                      ? 'bg-yellow-400 text-black border-yellow-300'
                      : 'bg-blue-900 text-white border-blue-950'
                  }`}
                >
                  Use &quot;{searchTerm.trim()}&quot; for this bill
                </button>
              )}
            </div>
          ) : (
            filtered.map((c, idx) => {
              const isSelected =
                currentRetailer.trim().toLowerCase() === c.name.trim().toLowerCase();
              const hasBalance = c.balanceDue > 0;

              return (
                <button
                  key={`${c.name}-${idx}`}
                  type="button"
                  onClick={() => handleSelectCustomer(c)}
                  className={`w-full text-left p-3.5 sm:p-4 rounded-xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-md cursor-pointer ${
                    isSelected
                      ? highContrastMode
                        ? 'bg-yellow-400 text-black border-yellow-300 ring-4 ring-yellow-500'
                        : 'bg-blue-50 border-blue-900 ring-2 ring-blue-800'
                      : highContrastMode
                      ? 'bg-zinc-900 text-yellow-300 border-yellow-500 hover:bg-zinc-800'
                      : 'bg-white text-stone-900 border-slate-300 hover:bg-slate-50'
                  }`}
                  style={{ minHeight: '64px' }}
                  id={`select-customer-${c.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Big Number Badge for Easy Vision Identification */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 border ${
                        isSelected
                          ? 'bg-black text-yellow-400 border-black'
                          : highContrastMode
                          ? 'bg-yellow-400 text-black border-yellow-300'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      {idx + 1}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-black text-base sm:text-lg leading-tight truncate ${
                            isSelected && highContrastMode ? 'text-black' : ''
                          }`}
                        >
                          {c.name}
                        </span>
                        {isSelected && (
                          <span className="text-[11px] uppercase font-black px-2 py-0.5 rounded bg-black text-white">
                            Selected
                          </span>
                        )}
                      </div>

                      <div
                        className={`flex items-center gap-3 text-xs font-semibold flex-wrap ${
                          isSelected && highContrastMode
                            ? 'text-zinc-900'
                            : highContrastMode
                            ? 'text-yellow-200'
                            : 'text-slate-600'
                        }`}
                      >
                        {c.phone ? (
                          <span className="flex items-center gap-1 font-mono font-bold">
                            <Phone size={13} /> {c.phone}
                          </span>
                        ) : (
                          <span className="italic opacity-60">No phone saved</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Receipt size={13} /> {c.totalBills} bill{c.totalBills !== 1 ? 's' : ''}
                        </span>
                        {c.lastBillDate && (
                          <span className="flex items-center gap-1">
                            <Clock size={13} /> Last: {c.lastBillDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial Due / Paid Badge */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                    <div
                      className={`text-xs ${
                        isSelected && highContrastMode
                          ? 'text-black'
                          : highContrastMode
                          ? 'text-yellow-200'
                          : 'text-slate-500'
                      }`}
                    >
                      Billed: <span className="font-bold">₹{money(c.totalBilled)}</span>
                    </div>

                    <div>
                      {hasBalance ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-md border ${
                            highContrastMode
                              ? 'bg-rose-950 text-rose-300 border-rose-500'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          <AlertCircle size={13} /> Due: ₹{money(c.balanceDue)}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-md border ${
                            highContrastMode
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <CheckCircle2 size={13} /> All Paid
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`p-3 sm:p-3.5 border-t-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-bold ${
            highContrastMode
              ? 'border-yellow-400 bg-black text-yellow-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
          style={{ paddingBottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
        >
          <span className="flex items-center gap-1.5 text-center sm:text-left">
            <Mic size={14} className="shrink-0 text-blue-600" />
            <span>Tip: Tap microphone to speak shop name or tap number to pick.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl font-black border-2 cursor-pointer transition-colors flex items-center justify-center ${
              highContrastMode
                ? 'bg-yellow-400 text-black border-yellow-300 hover:bg-yellow-300'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
