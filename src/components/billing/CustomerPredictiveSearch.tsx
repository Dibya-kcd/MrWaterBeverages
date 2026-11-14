import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  User,
  UserPlus,
  Phone,
  Mail,
  Zap,
  Check,
  ChevronDown,
  Loader2,
  AlertCircle,
  Hash,
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import { Customer, ExistingCustomer } from '../../types';
import { normCustName } from '../../context/ledgerHelpers';

export interface RichCustomerOption {
  id: string;
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  gstin?: string;
  city?: string;
  address?: string;
  route?: string;
  balanceDue?: number;
  totalBills?: number;
  totalBilled?: number;
  lastBillDate?: string;
}

export interface CustomerPredictiveSearchProps {
  selectedCustomerId: string;
  selectedCustomerName: string;
  selectedCustomerPhone?: string;
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  onSelectCustomer: (customer: RichCustomerOption) => void;
  onSelectSpotSale: () => void;
  onOpenCreateCustomer: (prefill: { name?: string; phone?: string; email?: string; gstin?: string }) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Highlight matched substring
const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim() || !text) return <span>{text}</span>;
  const q = query.trim();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-100 text-amber-950 font-bold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

export const CustomerPredictiveSearch: React.FC<CustomerPredictiveSearchProps> = ({
  selectedCustomerId,
  selectedCustomerName,
  selectedCustomerPhone,
  customers,
  existingCustomers,
  onSelectCustomer,
  onSelectSpotSale,
  onOpenCreateCustomer,
  id = 'select-customer',
  label = 'CUSTOMER',
  placeholder = 'Search by name, mobile, customer ID, or email...',
  disabled = false,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync display with external customer selection
  useEffect(() => {
    if (!isOpen && !isMobileModalOpen) {
      if (selectedCustomerId === '__walkin__') {
        setQuery('Apt / Walk-in sale');
      } else {
        setQuery(selectedCustomerName || '');
      }
    }
  }, [selectedCustomerId, selectedCustomerName, isOpen, isMobileModalOpen]);

  // Debounce user input (150ms for snappy responsiveness)
  useEffect(() => {
    if (!isOpen && !isMobileModalOpen) return;
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setIsDebouncing(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen, isMobileModalOpen]);

  // Merge customers and existingCustomers with rich identifying details
  const allCustomers = useMemo<RichCustomerOption[]>(() => {
    const map = new Map<string, RichCustomerOption>();

    // 1. Process existing customers with billing metrics
    (existingCustomers || []).forEach((ec, idx) => {
      const trimmed = (ec.name || '').trim();
      if (!trimmed) return;
      const key = normCustName(trimmed) || trimmed.toLowerCase();
      const ecId = ec.id || `ec_${idx}_${encodeURIComponent(key)}`;
      map.set(key, {
        id: ecId,
        name: trimmed,
        phone: ec.phone || '',
        altPhone: ec.altPhone || '',
        address: ec.address || '',
        city: ec.city || '',
        gstin: ec.gstin || '',
        balanceDue: ec.balanceDue,
        totalBills: ec.totalBills,
        totalBilled: ec.totalBilled,
        lastBillDate: ec.lastBillDate,
      });
    });

    // Shops that share a name but have different phone numbers are different customers: list each one
    // separately (the by-name summary above cannot tell them apart, so it is dropped for those names).
    const last10 = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
    const phonesByName = new Map<string, Set<string>>();
    ((customers || []) as Customer[]).forEach((c) => {
      const k = normCustName(c.name);
      const d = last10(c.phone);
      if (!k || d.length < 10) return;
      if (!phonesByName.has(k)) phonesByName.set(k, new Set());
      phonesByName.get(k)!.add(d);
    });
    const splitNames = new Set<string>();
    phonesByName.forEach((set, k) => {
      if (set.size > 1) splitNames.add(k);
    });
    splitNames.forEach((k) => map.delete(k));

    // 2. Process master customers
    ((customers || []) as Array<Customer & { balanceDue?: number }>).forEach((c, idx) => {
      const trimmed = (c.name || '').trim();
      if (!trimmed) return;
      const nameKey = normCustName(trimmed) || trimmed.toLowerCase();
      const d = last10(c.phone);
      const key = splitNames.has(nameKey) ? `${nameKey}|${d.length === 10 ? d : c.id}` : nameKey;
      const existing = map.get(key);
      const custId = c.id || `cust_${idx}_${encodeURIComponent(key)}`;

      if (existing) {
        if (!existing.phone && c.phone) existing.phone = c.phone;
        if (!existing.altPhone && c.altPhone) existing.altPhone = c.altPhone;
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.gstin && c.gstin) existing.gstin = c.gstin;
        if (!existing.city && c.city) existing.city = c.city;
        if (!existing.address && c.address) existing.address = c.address;
        if (!existing.route && c.route) existing.route = c.route;
        if (existing.balanceDue === undefined && c.balanceDue !== undefined) {
          existing.balanceDue = c.balanceDue;
        }
        if (c.id && !c.id.startsWith('cust_idx')) {
          existing.id = c.id;
        }
      } else {
        map.set(key, {
          id: custId,
          name: trimmed,
          phone: c.phone || '',
          altPhone: c.altPhone || '',
          email: c.email || '',
          gstin: c.gstin || '',
          city: c.city || '',
          address: c.address || '',
          route: c.route || '',
          balanceDue: c.balanceDue,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, existingCustomers]);

  // Predictive search across Name, Mobile, Customer ID, Email, GSTIN, Route/City
  const searchResults = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) {
      // If query is empty, show the first 10 customers
      return allCustomers.slice(0, 10);
    }

    const cleanDigits = q.replace(/\D/g, '');

    return allCustomers.filter((c) => {
      // 1. Name match
      if (c.name.toLowerCase().includes(q)) return true;
      // 2. Mobile / Phone number match (including partial and digit-only)
      if (c.phone && c.phone.toLowerCase().includes(q)) return true;
      if (cleanDigits && c.phone && c.phone.replace(/\D/g, '').includes(cleanDigits)) return true;
      if (c.altPhone && c.altPhone.toLowerCase().includes(q)) return true;
      if (cleanDigits && c.altPhone && c.altPhone.replace(/\D/g, '').includes(cleanDigits)) return true;
      // 3. Customer ID match
      if (c.id && c.id.toLowerCase().includes(q)) return true;
      // 4. Email match
      if (c.email && c.email.toLowerCase().includes(q)) return true;
      // 5. GSTIN match
      if (c.gstin && c.gstin.toLowerCase().includes(q)) return true;
      // 6. City / Route
      if (c.city && c.city.toLowerCase().includes(q)) return true;
      if (c.route && c.route.toLowerCase().includes(q)) return true;

      return false;
    });
  }, [allCustomers, debouncedQuery]);

  // Click outside listener for desktop dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancelSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedCustomerId, selectedCustomerName]);

  // Prefill helper for "Create New Customer"
  const extractPrefill = useCallback((text: string) => {
    const trimmed = text.trim();
    const cleanDigits = trimmed.replace(/\D/g, '');
    const isDigitsOnly = cleanDigits.length >= 7 && cleanDigits.length === trimmed.length;
    const isEmailLike = trimmed.includes('@') && trimmed.includes('.');
    const isGstinLike = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(trimmed);

    if (isDigitsOnly) {
      return { phone: trimmed, name: '' };
    }
    if (isEmailLike) {
      const userPart = trimmed.split('@')[0].replace(/[._-]/g, ' ');
      const formattedName = userPart ? userPart.charAt(0).toUpperCase() + userPart.slice(1) : '';
      return { email: trimmed, name: formattedName };
    }
    if (isGstinLike) {
      return { gstin: trimmed.toUpperCase(), name: '' };
    }
    return { name: trimmed, phone: '' };
  }, []);

  // Open Search Mode
  const handleOpenSearch = () => {
    if (disabled) return;
    // Check if mobile viewport (< 640px)
    if (window.innerWidth < 640) {
      setIsMobileModalOpen(true);
      setTimeout(() => mobileInputRef.current?.focus(), 80);
    } else {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.select(), 50);
    }
    setHighlightedIndex(-1);
  };

  // Distinct Action 1: Clear query (× button)
  const handleClearQuery = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setQuery('');
    setDebouncedQuery('');
    setHighlightedIndex(-1);
    if (isMobileModalOpen) {
      mobileInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  // Distinct Action 2: Cancel Search (Cancel button or Escape)
  const handleCancelSearch = () => {
    setIsOpen(false);
    setIsMobileModalOpen(false);
    setHighlightedIndex(-1);
    // Restore current selected customer name
    if (selectedCustomerId === '__walkin__') {
      setQuery('Apt / Walk-in sale');
    } else {
      setQuery(selectedCustomerName || '');
    }
    setDebouncedQuery(selectedCustomerName || '');
  };

  // Select Customer
  const handleSelect = (customer: RichCustomerOption) => {
    onSelectCustomer(customer);
    setQuery(customer.name);
    setDebouncedQuery(customer.name);
    setIsOpen(false);
    setIsMobileModalOpen(false);
    setHighlightedIndex(-1);
  };

  // Select Spot Sale
  const handleSpotSale = () => {
    onSelectSpotSale();
    setQuery('Apt / Walk-in sale');
    setDebouncedQuery('Apt / Walk-in sale');
    setIsOpen(false);
    setIsMobileModalOpen(false);
    setHighlightedIndex(-1);
  };

  // Trigger Create New Customer
  const handleCreateNew = () => {
    const prefill = extractPrefill(query);
    setIsOpen(false);
    setIsMobileModalOpen(false);
    setHighlightedIndex(-1);
    onOpenCreateCustomer(prefill);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        handleOpenSearch();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next >= searchResults.length ? 0 : next;
      });
      scrollHighlightedItemIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? searchResults.length - 1 : next;
      });
      scrollHighlightedItemIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
        handleSelect(searchResults[highlightedIndex]);
      } else if (searchResults.length === 1) {
        handleSelect(searchResults[0]);
      } else if (searchResults.length === 0) {
        if (query.trim()) {
          handleCreateNew();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelSearch();
    }
  };

  const scrollHighlightedItemIntoView = () => {
    setTimeout(() => {
      if (listRef.current) {
        const activeEl = listRef.current.querySelector('[data-highlighted="true"]');
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      }
    }, 20);
  };

  const isQueryActive = query.trim().length > 0;
  const isSelected = Boolean(selectedCustomerId && selectedCustomerName);
  const isSpotSaleSelected = selectedCustomerId === '__walkin__';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Label & Accessibility */}
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
          {label}
        </label>
        {isSelected && !isOpen && (
          <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active selection</span>
          </span>
        )}
      </div>

      {/* Main Autocomplete Input Field */}
      <div className="relative flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center">
          {/* Search or Spinner Icon */}
          <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
            {isDebouncing ? (
              <Loader2 className="w-4 h-4 text-emerald-700 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </div>

          <input enterKeyHint="search"
            id={id}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={handleOpenSearch}
            onClick={handleOpenSearch}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 transition-all cursor-text shadow-2xs"
          />

          {/* Right Action Cluster: Clear (×) button & Dropdown indicator */}
          <div className="absolute right-2.5 flex items-center gap-1">
            {isQueryActive && (
              <button
                type="button"
                onClick={handleClearQuery}
                title="Clear query"
                aria-label="Clear search query"
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isOpen) {
                  handleCancelSearch();
                } else {
                  handleOpenSearch();
                }
              }}
              aria-label="Toggle customer suggestions"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-700' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Separate Cancel Button visible when search mode is active */}
        {isOpen && (
          <button
            type="button"
            onClick={handleCancelSearch}
            className="shrink-0 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Selected Customer Summary Indicator under input (when closed) */}
      {!isOpen && isSelected && !isSpotSaleSelected && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium truncate">
          <span className="font-semibold">{selectedCustomerName}</span>
          {selectedCustomerPhone && <span>· {selectedCustomerPhone}</span>}
        </div>
      )}
      {!isOpen && isSpotSaleSelected && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-800 font-medium">
          <Zap className="w-3 h-3 text-amber-600" />
          <span>Walk-in / Spot cash customer active</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. DESKTOP AUTOCOMPLETE DROPDOWN (< sm:hidden or standard dropdown)  */}
      {/* ===================================================================== */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className="hidden sm:block absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 animate-in fade-in-50 zoom-in-98 duration-150 max-h-80 overflow-y-auto"
        >
          {/* Quick Action Strip (Spot Sale & New Customer shortcuts) */}
          <div className="bg-slate-50/80 p-2 flex items-center gap-2 text-xs font-semibold border-b border-slate-100">
            <button
              type="button"
              onClick={handleSpotSale}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100/80 text-amber-900 transition-colors cursor-pointer text-[11px] font-bold"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              <span>Apt / Walk-in sale</span>
            </button>
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950 transition-colors cursor-pointer text-[11px] font-bold"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-700" />
              <span>New customer</span>
            </button>
          </div>

          {/* Loading Indicator */}
          {isDebouncing && (
            <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              <span>Searching customer database...</span>
            </div>
          )}

          {/* Search Results List */}
          {!isDebouncing && searchResults.length > 0 && (
            <div className="py-1">
              {searchResults.map((c, idx) => {
                const isItemActive = idx === highlightedIndex;
                const isCurrentlySelected =
                  c.id === selectedCustomerId || c.name.toLowerCase() === selectedCustomerName.toLowerCase();

                return (
                  <button
                    key={c.id || `c_${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isCurrentlySelected}
                    data-highlighted={isItemActive}
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isItemActive ? 'bg-emerald-50/80' : isCurrentlySelected ? 'bg-slate-50' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate">
                          <HighlightMatch text={c.name} query={debouncedQuery} />
                        </span>
                        {c.id && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200/60 shrink-0">
                            #{c.id.replace('cust_', '').slice(0, 10)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        {c.phone && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <HighlightMatch text={c.phone} query={debouncedQuery} />
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 shrink-0 text-slate-400">
                            <Mail className="w-3 h-3" />
                            <HighlightMatch text={c.email} query={debouncedQuery} />
                          </span>
                        )}
                        {c.city && (
                          <span className="flex items-center gap-1 shrink-0 text-slate-400">
                            <MapPin className="w-3 h-3" />
                            <span>{c.city}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 text-right">
                      {c.balanceDue !== undefined && c.balanceDue > 0 && (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0">
                          Due: ₹{c.balanceDue.toLocaleString('en-IN')}
                        </span>
                      )}
                      {isCurrentlySelected && (
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 3. Empty State: No Customer Found (Exact match to requirements) */}
          {!isDebouncing && isQueryActive && searchResults.length === 0 && (
            <div className="p-4 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  No customer found. Try another search or choose an option.
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Search query "{query}" did not match any customer record.
                </p>
              </div>

              {/* Two required action options: Create New Customer & Spot Sale */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold hover:bg-[var(--primary)] shadow-xs cursor-pointer transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create New Customer</span>
                </button>
                <button
                  type="button"
                  onClick={handleSpotSale}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold hover:bg-amber-100 cursor-pointer transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-700" />
                  <span>Spot Sale</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. MOBILE FULL-SCREEN RESPONSIVE SEARCH SHEET (Touch-friendly & fast) */}
      {/* ===================================================================== */}
      {isMobileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="sm:hidden fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Mobile Top Header: Back/Cancel + Search Input + Clear */}
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCancelSearch}
              aria-label="Back / Cancel customer search"
              className="p-2 -ml-1 text-slate-600 hover:text-slate-900 cursor-pointer rounded-lg hover:bg-slate-200/60"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input enterKeyHint="search"
                ref={mobileInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, ID, email..."
                autoComplete="off"
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
              {isQueryActive && (
                <button
                  type="button"
                  onClick={handleClearQuery}
                  aria-label="Clear query"
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCancelSearch}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Mobile Action Shortcuts (Spot Sale & New Customer) */}
          <div className="p-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSpotSale}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-amber-300 bg-white text-amber-900 active:bg-amber-50 text-xs font-bold shadow-2xs"
            >
              <Zap className="w-4 h-4 text-amber-600" />
              <span>Apt / Walk-in sale</span>
            </button>
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-950 active:bg-emerald-100 text-xs font-bold shadow-2xs"
            >
              <UserPlus className="w-4 h-4 text-emerald-700" />
              <span>New Customer</span>
            </button>
          </div>

          {/* Results / List Body on Mobile */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {isDebouncing && (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                <span>Searching customer database...</span>
              </div>
            )}

            {!isDebouncing && searchResults.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {isQueryActive ? `Matching Customers (${searchResults.length})` : 'Recent & Saved Customers'}
                </div>
                {searchResults.map((c, idx) => {
                  const isCurrentlySelected =
                    c.id === selectedCustomerId || c.name.toLowerCase() === selectedCustomerName.toLowerCase();

                  return (
                    <button
                      key={c.id || `mob_c_${idx}`}
                      type="button"
                      onClick={() => handleSelect(c)}
                      className={`w-full min-h-[52px] text-left px-3.5 py-3 flex items-center justify-between active:bg-emerald-50 transition-colors cursor-pointer ${
                        isCurrentlySelected ? 'bg-slate-50 font-bold' : ''
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            <HighlightMatch text={c.name} query={debouncedQuery} />
                          </span>
                          {c.id && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded shrink-0">
                              #{c.id.replace('cust_', '').slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                          {c.phone && (
                            <span className="flex items-center gap-1 shrink-0">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <HighlightMatch text={c.phone} query={debouncedQuery} />
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1 shrink-0 text-slate-400 truncate max-w-[140px]">
                              <Mail className="w-3 h-3" />
                              <span>{c.email}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2 text-right">
                        {c.balanceDue !== undefined && c.balanceDue > 0 && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Due: ₹{c.balanceDue.toLocaleString('en-IN')}
                          </span>
                        )}
                        {isCurrentlySelected && (
                          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty State on Mobile */}
            {!isDebouncing && isQueryActive && searchResults.length === 0 && (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    No customer found. Try another search or choose an option.
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    No matching customer for "{query}".
                  </p>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-bold shadow-md cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Create New Customer</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSpotSale}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-sm font-bold cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-amber-700" />
                    <span>Spot Sale (Apt / Walk-in)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
