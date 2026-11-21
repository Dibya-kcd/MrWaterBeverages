import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Truck,
  X,
} from 'lucide-react';

/**
 * New Sale · order context bar:
 *  - Dual selector buttons (Trip / Van vs Warehouse) that switch source and open
 *    an inline dropdown chooser listing every available trip or warehouse
 *  - Interactive back-date selector button (Today / Yesterday / 2 days ago + mini calendar)
 */
export type SaleSource = 'trip' | 'warehouse';

export interface ContextTrip {
  id: number;
  label: string;
  vehicle?: string;
  salesman?: string;
  route?: string;
  date?: string;
  casesLeft?: number;
}

export interface ContextWarehouse {
  id: string;
  name: string;
  code?: string;
  casesLeft?: number;
}

export interface OrderContextBarProps {
  saleSource: SaleSource;
  onSaleSourceChange: (s: SaleSource) => void;
  trips: ContextTrip[];
  selectedTripId?: number;
  onTripChange: (id: number) => void;
  warehouses?: ContextWarehouse[];
  selectedWarehouseId?: string;
  onWarehouseChange?: (id: string) => void;
  saleDate: string; // YYYY-MM-DD
  onSaleDateChange: (iso: string) => void;
  todayIso: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const parseIsoParts = (iso: string): { y: number; m: number; d: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
};

const addDaysIso = (iso: string, deltaDays: number): string => {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m, p.d + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

/** "Today, 17 Nov" for today, "Yesterday, 16 Nov" for yesterday, otherwise "14 Nov 2026". */
export const formatSaleDate = (iso: string, todayIso: string): string => {
  const t = Date.parse(`${iso}T12:00:00`);
  if (!iso || isNaN(t)) return iso || '';
  const d = new Date(t);
  const day = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  if (iso === todayIso) return `Today, ${day}`;
  if (iso === addDaysIso(todayIso, -1)) return `Yesterday, ${day}`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Crisp Warehouse building glyph matching the dark-blue active pill & light card style. */
const WarehouseGlyph: React.FC<{ active?: boolean; muted?: boolean }> = ({ active, muted }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="w-[18px] h-[18px] shrink-0"
  >
    <path
      d="M3 9.5L12 4L21 9.5V20C21 20.55 20.55 21 20 21H4C3.45 21 3 20.55 3 20V9.5Z"
      fill={active ? '#FFFFFF' : 'none'}
      stroke={active ? '#FFFFFF' : muted ? '#94A3B8' : '#1A63DB'}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <rect
      x="6.5"
      y="12"
      width="11"
      height="9"
      rx="1"
      fill={active ? '#0A2C6B' : muted ? '#E2E8F0' : '#DBEAFE'}
    />
    <rect
      x="8"
      y="14"
      width="3.5"
      height="3"
      rx="0.5"
      fill={active ? '#FACC15' : muted ? '#94A3B8' : '#1A63DB'}
    />
    <rect
      x="12.5"
      y="14"
      width="3.5"
      height="3"
      rx="0.5"
      fill={active ? '#FACC15' : muted ? '#94A3B8' : '#1A63DB'}
    />
    <rect
      x="8"
      y="17.8"
      width="8"
      height="2.6"
      rx="0.5"
      fill={active ? '#FACC15' : muted ? '#94A3B8' : '#1A63DB'}
    />
  </svg>
);

export const OrderContextBar: React.FC<OrderContextBarProps> = ({
  saleSource,
  onSaleSourceChange,
  trips,
  selectedTripId,
  onTripChange,
  warehouses = [],
  selectedWarehouseId,
  onWarehouseChange,
  saleDate,
  onSaleDateChange,
  todayIso,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<'trip' | 'warehouse' | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');

  const initialParts = parseIsoParts(saleDate) || parseIsoParts(todayIso) || {
    y: new Date().getFullYear(),
    m: new Date().getMonth(),
    d: new Date().getDate(),
  };
  const [viewYear, setViewYear] = useState(initialParts.y);
  const [viewMonth, setViewMonth] = useState(initialParts.m);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const openDatePicker = () => {
    setOpenMenu(null);
    const p = parseIsoParts(saleDate) || parseIsoParts(todayIso);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    }
    setDateOpen((prev) => !prev);
  };

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  };

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    return cells;
  }, [viewYear, viewMonth]);

  const isBackDated = Boolean(saleDate && todayIso && saleDate < todayIso);
  const yesterdayIso = addDaysIso(todayIso, -1);
  const twoDaysAgoIso = addDaysIso(todayIso, -2);

  const filteredTrips = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) =>
      `${t.label} ${t.vehicle || ''} ${t.salesman || ''} ${t.route || ''} ${t.id}`.toLowerCase().includes(q),
    );
  }, [trips, sourceQuery]);

  const filteredWarehouses = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter((w) => `${w.name} ${w.code || ''}`.toLowerCase().includes(q));
  }, [warehouses, sourceQuery]);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || trips[0],
    [trips, selectedTripId],
  );
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0],
    [warehouses, selectedWarehouseId],
  );

  const activeSummary = useMemo(() => {
    if (saleSource === 'trip' && selectedTrip) {
      const base = selectedTrip.vehicle
        ? `${selectedTrip.vehicle} · #TRP-${selectedTrip.id}`
        : `#TRP-${selectedTrip.id}`;
      return selectedTrip.casesLeft !== undefined ? `${base} · ${selectedTrip.casesLeft} cs` : base;
    }
    if (saleSource === 'warehouse' && selectedWarehouse) {
      return selectedWarehouse.casesLeft !== undefined
        ? `${selectedWarehouse.name} · ${selectedWarehouse.casesLeft} cs`
        : selectedWarehouse.name;
    }
    return '';
  }, [saleSource, selectedTrip, selectedWarehouse]);

  const handleTripButtonClick = () => {
    setDateOpen(false);
    setSourceQuery('');
    if (saleSource !== 'trip' && trips.length > 0) {
      onSaleSourceChange('trip');
      setOpenMenu('trip');
      return;
    }
    setOpenMenu((prev) => (prev === 'trip' ? null : 'trip'));
  };

  const handleWarehouseButtonClick = () => {
    setDateOpen(false);
    setSourceQuery('');
    if (saleSource !== 'warehouse') {
      onSaleSourceChange('warehouse');
      setOpenMenu('warehouse');
      return;
    }
    setOpenMenu((prev) => (prev === 'warehouse' ? null : 'warehouse'));
  };

  const pillBtn = (active: boolean) =>
    `hh-context-pill w-full min-h-[42px] sm:min-h-[44px] px-2.5 sm:px-3 rounded-full border text-[12px] sm:text-[13.5px] font-bold inline-flex items-center justify-between gap-1 sm:gap-2 transition-all cursor-pointer ${
      active
        ? 'bg-[#0A2558] bg-gradient-to-b from-[#0D3984] to-[#082458] text-white! border-[#0A2C6B] shadow-sm'
        : 'bg-white text-[#0A1F44] border-[#DCE5F2] hover:bg-[#F5F8FD] shadow-2xs'
    }`;

  return (
    <div ref={rootRef} className="hh-context-bar space-y-2.5">
      {/* Row 1: Dual source pill buttons (Van vs Godown) */}
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5" role="group" aria-label="Stock source">
        <button
          type="button"
          aria-pressed={saleSource === 'trip'}
          aria-expanded={openMenu === 'trip'}
          onClick={handleTripButtonClick}
          className={pillBtn(saleSource === 'trip')}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Truck
              className={`w-4 h-4 shrink-0 ${
                saleSource === 'trip' ? 'text-white' : 'text-[#1A63DB]'
              }`}
            />
            <span className="whitespace-nowrap">
              {trips.length === 0 ? 'No trip' : 'Van trip'}
            </span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${
              openMenu === 'trip' ? 'rotate-180' : ''
            } ${saleSource === 'trip' ? 'text-white/90' : 'text-[#0A1F44]'}`}
          />
        </button>

        <button
          type="button"
          aria-pressed={saleSource === 'warehouse'}
          aria-expanded={openMenu === 'warehouse'}
          onClick={handleWarehouseButtonClick}
          className={pillBtn(saleSource === 'warehouse')}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <WarehouseGlyph active={saleSource === 'warehouse'} />
            <span className="whitespace-nowrap">Godown</span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${
              openMenu === 'warehouse' ? 'rotate-180' : ''
            } ${saleSource === 'warehouse' ? 'text-white/90' : 'text-[#0A1F44]'}`}
          />
        </button>
      </div>

      {/* Dropdown chooser panel for Trip / Van */}
      {openMenu === 'trip' && (
        <div
          className="hh-context-dropdown rounded-2xl bg-white border border-[#D8E3F2] shadow-[0_10px_28px_-6px_rgba(10,31,68,0.14)] overflow-hidden"
          role="listbox"
          aria-label="Choose active trip or van"
        >
          {trips.length > 4 && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Filter open trips..."
                  className="w-full min-h-[36px] pl-8 pr-8 rounded-xl border border-[#DCE5F2] bg-white text-xs font-semibold text-[#0A1F44] focus:outline-none focus:border-[#1A63DB]"
                />
                {sourceQuery && (
                  <button
                    type="button"
                    onClick={() => setSourceQuery('')}
                    aria-label="Clear trip filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {filteredTrips.length === 0 ? (
              <div className="px-3.5 py-3 text-xs font-medium text-slate-500 flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {trips.length === 0
                    ? 'No active trip or van is out right now.'
                    : `No open trips match "${sourceQuery}".`}
                </span>
              </div>
            ) : (
              filteredTrips.map((tr) => {
                const active = saleSource === 'trip' && tr.id === selectedTripId;
                const title = tr.vehicle ? `${tr.vehicle} · #TRP-${tr.id}` : tr.label;
                const meta = [
                  tr.salesman,
                  tr.route,
                  tr.casesLeft !== undefined ? `${tr.casesLeft} cs` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={tr.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      if (saleSource !== 'trip') onSaleSourceChange('trip');
                      onTripChange(tr.id);
                      setOpenMenu(null);
                    }}
                    className={`w-full min-h-[50px] px-3.5 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      active ? 'bg-[#F0F6FF]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Truck
                      className={`w-[18px] h-[18px] shrink-0 ${
                        active ? 'text-[#1A63DB]' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-[#0A1F44] leading-snug break-words">
                        {title}
                      </div>
                      {meta && (
                        <div className="text-[11.5px] font-medium text-[#5A7198] leading-snug mt-0.5 break-words tabular-nums">
                          {meta}
                        </div>
                      )}
                    </div>
                    {active && <Check className="w-4 h-4 text-[#1A63DB] shrink-0 stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Dropdown chooser panel for Warehouse */}
      {openMenu === 'warehouse' && (
        <div
          className="hh-context-dropdown rounded-2xl bg-white border border-[#D8E3F2] shadow-[0_10px_28px_-6px_rgba(10,31,68,0.14)] overflow-hidden"
          role="listbox"
          aria-label="Choose warehouse"
        >
          {warehouses.length > 4 && (
            <div className="p-2 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Filter warehouses..."
                  className="w-full min-h-[36px] pl-8 pr-8 rounded-xl border border-[#DCE5F2] bg-white text-xs font-semibold text-[#0A1F44] focus:outline-none focus:border-[#1A63DB]"
                />
                {sourceQuery && (
                  <button
                    type="button"
                    onClick={() => setSourceQuery('')}
                    aria-label="Clear warehouse filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {filteredWarehouses.length === 0 ? (
              <div className="px-3.5 py-3 text-xs font-medium text-slate-500">
                {warehouses.length === 0
                  ? 'No warehouses configured.'
                  : `No warehouses match "${sourceQuery}".`}
              </div>
            ) : (
              filteredWarehouses.map((w) => {
                const active =
                  saleSource === 'warehouse' &&
                  (w.id === selectedWarehouseId || (warehouses.length === 1 && !selectedWarehouseId));
                const meta = [
                  w.code,
                  w.casesLeft !== undefined
                    ? `${w.casesLeft} cs${w.casesLeft === 0 ? ' in stock' : ''}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      if (saleSource !== 'warehouse') onSaleSourceChange('warehouse');
                      onWarehouseChange?.(w.id);
                      setOpenMenu(null);
                    }}
                    className={`w-full min-h-[50px] px-3.5 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      active ? 'bg-[#F0F6FF]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <WarehouseGlyph muted={!active} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-[#0A1F44] leading-snug break-words">
                        {w.name}
                      </div>
                      {meta && (
                        <div className="text-[11.5px] font-medium text-[#5A7198] leading-snug mt-0.5 break-words tabular-nums">
                          {meta}
                        </div>
                      )}
                    </div>
                    {active && <Check className="w-4 h-4 text-[#1A63DB] shrink-0 stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Row 2: Bill Date selector pill + full selected source summary */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={openDatePicker}
          aria-expanded={dateOpen}
          aria-label="Change bill date"
          className={`hh-context-date min-h-[38px] sm:min-h-[42px] px-3 rounded-2xl border text-[12.5px] sm:text-[13.5px] font-bold inline-flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors shrink-0 shadow-2xs ${
            isBackDated
              ? 'hh-context-date--back bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/70'
              : dateOpen
                ? 'bg-[#0A1F44] border-[#0A1F44] text-white!'
                : 'bg-white border-[#DCE5F2] text-[#0A1F44] hover:bg-[#F5F8FD]'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="tabular-nums whitespace-nowrap">{formatSaleDate(saleDate, todayIso)}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${dateOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {activeSummary && (
          <span className="hh-context-summary text-[12px] font-semibold text-[#4A638D] leading-snug break-words tabular-nums">
            {activeSummary}
          </span>
        )}
      </div>

      {/* Expandable Back-Date Picker Panel (quick presets + visible date input + calendar) */}
      {dateOpen && (
        <div
          className="hh-context-dropdown rounded-2xl border border-[#DCE5F2] bg-[#F7FAFF] p-3 space-y-3 shadow-xs"
          role="region"
          aria-label="Pick bill date"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: 'Today', iso: todayIso },
                { label: 'Yesterday', iso: yesterdayIso },
                { label: '2 days ago', iso: twoDaysAgoIso },
              ].map((preset) => {
                const active = saleDate === preset.iso;
                return (
                  <button
                    key={preset.iso}
                    type="button"
                    onClick={() => {
                      onSaleDateChange(preset.iso);
                      setDateOpen(false);
                    }}
                    className={`min-h-[44px] sm:min-h-[34px] px-3 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#179B46] border-[#179B46] text-white'
                        : 'bg-white border-[#DCE5F2] text-[#0A1F44] hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="Enter bill date"
                value={saleDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onSaleDateChange(e.target.value);
                    const p = parseIsoParts(e.target.value);
                    if (p) {
                      setViewYear(p.y);
                      setViewMonth(p.m);
                    }
                  }
                }}
                className="min-h-[44px] sm:min-h-[34px] px-2.5 rounded-lg border border-[#DCE5F2] bg-white text-xs font-bold text-[#0A1F44] focus:outline-none focus:border-[#1A63DB]"
              />
              <button
                type="button"
                onClick={() => setDateOpen(false)}
                aria-label="Done picking date"
                className="min-h-[44px] sm:min-h-[34px] px-2.5 rounded-lg bg-[#0A1F44] text-white text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#DCE5F2] p-2.5 max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[#0A1F44] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-[#0A1F44]">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[#0A1F44] cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-[10.5px] font-bold text-slate-400">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarCells.map((day, idx) => {
                if (day === null) return <span key={`empty_${idx}`} />;
                const iso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
                const isSelected = iso === saleDate;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onSaleDateChange(iso);
                      setDateOpen(false);
                    }}
                    className={`h-8 rounded-lg text-xs font-bold tabular-nums cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#179B46] text-white'
                        : isToday
                          ? 'bg-emerald-50 text-[#179B46] border border-emerald-300'
                          : 'text-[#0A1F44] hover:bg-slate-100'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
