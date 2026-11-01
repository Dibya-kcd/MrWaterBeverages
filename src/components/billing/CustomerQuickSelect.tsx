import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { notify } from "../../utils/toast";
import {
  Search,
  X,
  Mic,
  MicOff,
  BookUser,
  Phone,
  User,
  Check,
  UserPlus,
  Zap,
  Mail,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { ExistingCustomer } from '../../types';
import { startSpeechRecognition, isSpeechRecognitionSupported, ActiveSpeechSession } from '../../utils/speechRecognition';

interface CustomerQuickSelectProps {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (phone: string) => void;
  customers: ExistingCustomer[];
  onOpenDirectory?: () => void;
  compact?: boolean;
  label?: string;
  speakAssistiveText?: (text: string) => void;
  onSelectCustomer?: (customer: ExistingCustomer) => void;
  onSelectSpotSale?: () => void;
  onOpenCreateCustomer?: (prefill: { name?: string; phone?: string; email?: string; gstin?: string }) => void;
}

export const CustomerQuickSelect: React.FC<CustomerQuickSelectProps> = ({
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  customers,
  onOpenDirectory,
  compact = false,
  label = 'Customer / Retail Shop',
  speakAssistiveText,
  onSelectCustomer,
  onSelectSpotSale,
  onOpenCreateCustomer,
}) => {
  const [query, setQuery] = useState(customerName);
  const [debouncedQuery, setDebouncedQuery] = useState(customerName);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isListening, setIsListening] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceSessionRef = useRef<ActiveSpeechSession | null>(null);

  // Sync external name changes
  useEffect(() => {
    if (!showDropdown) {
      setQuery(customerName);
      setDebouncedQuery(customerName);
    }
  }, [customerName, showDropdown]);

  // Debounce search query
  useEffect(() => {
    if (!showDropdown) return;
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setIsDebouncing(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, showDropdown]);

  // Click outside to cancel & close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancelSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [customerName]);

  // Filter existing customers matching query by Name, Mobile, Customer ID, Email, GSTIN
  const suggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) {
      return customers.slice(0, 8);
    }

    const cleanDigits = q.replace(/\D/g, '');

    return customers
      .filter((c) => {
        // Name
        if (c.name.toLowerCase().includes(q)) return true;
        // Phone / Mobile / AltPhone
        if (c.phone && c.phone.toLowerCase().includes(q)) return true;
        if (cleanDigits && c.phone && c.phone.replace(/\D/g, '').includes(cleanDigits)) return true;
        if (c.altPhone && c.altPhone.toLowerCase().includes(q)) return true;
        if (cleanDigits && c.altPhone && c.altPhone.replace(/\D/g, '').includes(cleanDigits)) return true;
        // Customer ID
        if (c.id && c.id.toLowerCase().includes(q)) return true;
        // Email
        if ((c as any).email && String((c as any).email).toLowerCase().includes(q)) return true;
        // GSTIN
        if (c.gstin && c.gstin.toLowerCase().includes(q)) return true;
        // Address / City
        if (c.city && c.city.toLowerCase().includes(q)) return true;
        if (c.address && c.address.toLowerCase().includes(q)) return true;

        return false;
      })
      .slice(0, 8);
  }, [customers, debouncedQuery]);

  const handleSelect = (c: ExistingCustomer) => {
    onCustomerNameChange(c.name);
    setQuery(c.name);
    setDebouncedQuery(c.name);
    if (c.phone) onCustomerPhoneChange(c.phone);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    if (speakAssistiveText) speakAssistiveText(`Selected ${c.name}`);
    if (onSelectCustomer) {
      onSelectCustomer(c);
    }
  };

  // Distinct Action 1: Clear query (× button)
  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setQuery('');
    setDebouncedQuery('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Distinct Action 2: Cancel Search (Cancel button or Escape)
  const handleCancelSearch = () => {
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setQuery(customerName);
    setDebouncedQuery(customerName);
  };

  // Spot Sale fallback
  const handleSpotSale = () => {
    if (onSelectSpotSale) {
      onSelectSpotSale();
    } else {
      const spotCust: ExistingCustomer = {
        name: 'Apt / Walk-in sale',
        phone: '',
        totalBills: 0,
        totalBilled: 0,
        totalPaid: 0,
        balanceDue: 0,
        lastBillDate: '',
      };
      onCustomerNameChange(spotCust.name);
      onCustomerPhoneChange('');
      setQuery(spotCust.name);
      setDebouncedQuery(spotCust.name);
      if (onSelectCustomer) onSelectCustomer(spotCust);
    }
    setShowDropdown(false);
    setHighlightedIndex(-1);
    if (speakAssistiveText) speakAssistiveText('Selected Walk-in Spot Sale');
  };

  // Create New Customer fallback
  const handleCreateNewCustomer = () => {
    const trimmed = query.trim();
    const cleanDigits = trimmed.replace(/\D/g, '');
    const isDigits = cleanDigits.length >= 7 && cleanDigits.length === trimmed.length;
    const isEmail = trimmed.includes('@');

    const prefill = isDigits
      ? { phone: trimmed, name: '' }
      : isEmail
      ? { email: trimmed, name: '' }
      : { name: trimmed, phone: '' };

    setShowDropdown(false);
    setHighlightedIndex(-1);

    if (onOpenCreateCustomer) {
      onOpenCreateCustomer(prefill);
    } else if (onOpenDirectory) {
      onOpenDirectory();
    }
  };

  const handleVoiceSearch = () => {
    if (isListening) {
      if (voiceSessionRef.current) voiceSessionRef.current.abort();
      setIsListening(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      notify('Speech recognition is not supported in this browser.');
      return;
    }

    setIsListening(true);
    if (speakAssistiveText) speakAssistiveText('Listening for customer or shop name.');

    const session = startSpeechRecognition({
      onStart: () => setIsListening(true),
      onResult: (transcript) => {
        setIsListening(false);
        const lower = transcript.toLowerCase().trim();
        const matched = customers.find(
          (c) =>
            c.name.toLowerCase().includes(lower) ||
            lower.includes(c.name.toLowerCase())
        );

        if (matched) {
          handleSelect(matched);
        } else {
          onCustomerNameChange(transcript.trim());
          setQuery(transcript.trim());
          setDebouncedQuery(transcript.trim());
          if (speakAssistiveText) speakAssistiveText(`Customer set to ${transcript}`);
        }
      },
      onError: () => setIsListening(false),
      onEnd: () => setIsListening(false),
    });

    voiceSessionRef.current = session;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowDropdown(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 >= suggestions.length ? 0 : prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 < 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        handleSelect(suggestions[highlightedIndex]);
      } else if (suggestions.length === 1) {
        handleSelect(suggestions[0]);
      } else if (suggestions.length === 0) {
        if (query.trim()) handleCreateNewCustomer();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelSearch();
    }
  };

  const isQueryEntered = query.trim().length > 0;

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
          <User size={13} className="text-slate-400" />
          <span>{label}</span>
        </label>
        {onOpenDirectory && (
          <button
            type="button"
            onClick={onOpenDirectory}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <BookUser size={13} />
            <span>Customer Directory ({customers.length})</span>
          </button>
        )}
      </div>

      <div className={`grid ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'} gap-2`}>
        {/* Customer / Retailer Search Input with Suggestions */}
        <div className={`relative ${compact ? 'sm:col-span-2' : 'md:col-span-2'}`}>
          <div className="relative flex items-center gap-1.5">
            <div className="relative flex-1 flex items-center">
              {/* Search Icon or Loading Spinner */}
              <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
                {isDebouncing ? (
                  <Loader2 size={15} className="animate-spin text-emerald-700" />
                ) : (
                  <Search size={15} />
                )}
              </div>

              <input enterKeyHint="search"
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={showDropdown}
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  onCustomerNameChange(val);
                  if (!showDropdown) setShowDropdown(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name, phone, ID, email..."
                className="w-full pl-9 pr-20 py-2 text-sm bg-white border border-slate-200 rounded-xl font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 transition-all"
              />

              {/* Action Buttons inside Input: Clear (×) + Mic + Chevron */}
              <div className="absolute right-2 flex items-center gap-1">
                {isQueryEntered && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Clear search query"
                    aria-label="Clear search"
                    className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleVoiceSearch}
                  title={isListening ? 'Stop listening' : 'Voice search customer'}
                  className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-slate-100'
                  }`}
                >
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  aria-label="Toggle customer suggestions"
                  className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Separate Cancel Button to exit search mode */}
            {showDropdown && (
              <button
                type="button"
                onClick={handleCancelSearch}
                className="shrink-0 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in-50 duration-150">
              {/* Quick Action Shortcuts at top */}
              <div className="bg-slate-50/80 p-2 flex items-center gap-2 text-xs font-semibold border-b border-slate-100">
                <button
                  type="button"
                  onClick={handleSpotSale}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100/80 text-amber-900 transition-colors cursor-pointer text-[11px] font-bold"
                >
                  <Zap size={13} className="text-amber-600" />
                  <span>Spot Sale</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateNewCustomer}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950 transition-colors cursor-pointer text-[11px] font-bold"
                >
                  <UserPlus size={13} className="text-emerald-700" />
                  <span>+ New Customer</span>
                </button>
              </div>

              {/* Suggestions List */}
              {suggestions.length > 0 ? (
                <div className="py-1">
                  {suggestions.map((c, idx) => {
                    const isItemActive = idx === highlightedIndex;
                    return (
                      <button
                        key={c.id || c.name}
                        type="button"
                        onClick={() => handleSelect(c)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between text-xs cursor-pointer group ${
                          isItemActive ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-900 group-hover:text-emerald-800 flex items-center gap-1.5 truncate">
                            <span>{c.name}</span>
                            {c.id && (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded shrink-0">
                                #{c.id.replace('cust_', '').slice(0, 8)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            {c.phone && (
                              <span className="flex items-center gap-1 shrink-0">
                                <Phone size={10} className="text-slate-400" />
                                <span>{c.phone}</span>
                              </span>
                            )}
                            {(c as any).email && (
                              <span className="flex items-center gap-1 shrink-0 text-slate-400 truncate max-w-[130px]">
                                <Mail size={10} />
                                <span>{(c as any).email}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {c.balanceDue !== undefined && c.balanceDue > 0 && (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0">
                            Due: ₹{c.balanceDue.toLocaleString('en-IN')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : isQueryEntered ? (
                /* Empty state when no customers match */
                <div className="p-4 text-center space-y-3">
                  <div className="w-9 h-9 mx-auto rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      No customer found. Try another search or choose an option.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      No record found matching "{query}".
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCreateNewCustomer}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0d4a3a] text-white text-xs font-bold hover:bg-[#0a382c] cursor-pointer"
                    >
                      <UserPlus size={13} />
                      <span>Create New Customer</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSpotSale}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-950 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                    >
                      <Zap size={13} className="text-amber-700" />
                      <span>Spot Sale</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Customer Phone Input */}
        <div className="relative flex items-center">
          <Phone size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="WhatsApp / Phone (optional)"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 transition-all"
          />
        </div>
      </div>
    </div>
  );
};
