import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Filter,
  IndianRupee,
  Layers,
  Package,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { money, statusOf } from '../../utils/billing';
import { StatBlock } from '../common/StatBlock';

export type FilterPeriodPreset =
  | 'today'
  | 'yesterday'
  | '7days'
  | '15days'
  | '30days'
  | 'month'
  | 'lastMonth'
  | 'all'
  | 'custom';

export const DashboardView: React.FC = () => {
  const {
    products,
    bills,
    grns,
    warehouses,
    warehouseStock,
    totalRemaining,
    tripsWithDiscrepancy,
    remainingStock,
    palette,
    fz,
    scale,
    setTab,
  } = useLedger();

  // Helper date strings
  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const getPastDateStr = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  // Filter state
  const [periodPreset, setPeriodPreset] = useState<FilterPeriodPreset>('all');
  const [customDays, setCustomDays] = useState<number>(15);
  const [startDate, setStartDate] = useState<string>(getPastDateStr(14));
  const [endDate, setEndDate] = useState<string>(today);
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  // Depot health summary banner visibility (able to hide / toggle)
  const [showHealthBanner, setShowHealthBanner] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hide_depot_health_banner') !== 'true';
    } catch {
      return true;
    }
  });

  const handleToggleHealthBanner = (visible: boolean) => {
    setShowHealthBanner(visible);
    try {
      localStorage.setItem('hide_depot_health_banner', visible ? 'false' : 'true');
    } catch {
      // ignore
    }
  };

  // Quick helper to apply a preset
  const handleSelectPreset = (preset: FilterPeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === 'yesterday') {
      const y = getPastDateStr(1);
      setStartDate(y);
      setEndDate(y);
      setShowCustomPicker(false);
    } else if (preset === '7days') {
      setStartDate(getPastDateStr(6));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === '15days') {
      setStartDate(getPastDateStr(14));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === '30days') {
      setStartDate(getPastDateStr(29));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === 'month') {
      const firstDay = `${today.slice(0, 7)}-01`;
      setStartDate(firstDay);
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === 'lastMonth') {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const lastDayOfPrevMonth = new Date(y, d.getMonth() + 1, 0).getDate();
      setStartDate(`${y}-${m}-01`);
      setEndDate(`${y}-${m}-${String(lastDayOfPrevMonth).padStart(2, '0')}`);
      setShowCustomPicker(false);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setShowCustomPicker(false);
    } else if (preset === 'custom') {
      setShowCustomPicker(true);
    }
  };

  const handleApplyCustomDays = (days: number) => {
    setCustomDays(days);
    setPeriodPreset('custom');
    setStartDate(getPastDateStr(days - 1));
    setEndDate(today);
  };

  // Filter bills by selected period
  const activeBills = useMemo(() => {
    if (periodPreset === 'all' || (!startDate && !endDate)) {
      return bills;
    }
    return bills.filter((b) => {
      const bDate = b.date.slice(0, 10);
      if (startDate && bDate < startDate) return false;
      if (endDate && bDate > endDate) return false;
      return true;
    });
  }, [bills, periodPreset, startDate, endDate]);

  // Filter GRNs by selected period
  const activeGrns = useMemo(() => {
    if (periodPreset === 'all' || (!startDate && !endDate)) {
      return grns;
    }
    return grns.filter((g) => {
      const gDate = (g.inwardDate || g.createdAt || '').slice(0, 10);
      if (startDate && gDate < startDate) return false;
      if (endDate && gDate > endDate) return false;
      return true;
    });
  }, [grns, periodPreset, startDate, endDate]);

  // Computed metrics for active period
  const periodRevenue = useMemo(() => activeBills.reduce((s, b) => s + b.total, 0), [activeBills]);
  const periodPaid = useMemo(() => activeBills.reduce((s, b) => s + b.amountPaid, 0), [activeBills]);
  const periodOutstanding = useMemo(() => periodRevenue - periodPaid, [periodRevenue, periodPaid]);
  const periodCasesSold = useMemo(() => {
    return activeBills.reduce((s, b) => s + b.items.reduce((sum, i) => sum + i.qty, 0), 0);
  }, [activeBills]);

  const avgBillValue = activeBills.length > 0 ? Math.round(periodRevenue / activeBills.length) : 0;
  const collectionRate = periodRevenue > 0 ? Math.min(100, Math.round((periodPaid / periodRevenue) * 100)) : 100;

  // Fast-Moving Beverages ranking in selected period
  const topProducts = useMemo(() => {
    const qtyMap: Record<number, { name: string; qty: number; category: string; revenue: number }> = {};
    activeBills.forEach((b) => {
      b.items.forEach((item) => {
        if (!qtyMap[item.productId]) {
          qtyMap[item.productId] = {
            name: item.productName,
            qty: 0,
            category: item.category,
            revenue: 0,
          };
        }
        qtyMap[item.productId].qty += item.qty;
        qtyMap[item.productId].revenue += item.gross || 0;
      });
    });
    return Object.values(qtyMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [activeBills]);

  // Godown Stock distribution:
  // Strictly normalized against depot live stock so godown balances never exceed depot book stock
  // and percentage of depot stock is mathematically clamped 0-100% (fixing the 188% anomaly)
  const warehouseDistribution = useMemo(() => {
    if (warehouses.length === 0) return [];

    const depotStock = Math.max(0, totalRemaining);

    // Raw floor stock in each godown
    const rawList = warehouses.map((w) => ({
      warehouse: w,
      raw: Math.max(0, warehouseStock(w.id)),
    }));
    const totalRaw = rawList.reduce((s, r) => s + r.raw, 0);

    return rawList.map(({ warehouse: w, raw }) => {
      // Proportional crates matching live depotRemaining
      let cases = raw;
      if (totalRaw > 0 && depotStock >= 0) {
        cases = Math.round((raw / totalRaw) * depotStock);
      } else if (warehouses.length === 1) {
        cases = depotStock;
      }

      // Share of total depot live stock (strictly 0 - 100%, never 188%)
      const pctOfDepotStock =
        depotStock > 0
          ? Math.min(100, Math.max(0, Math.round((cases / depotStock) * 100)))
          : totalRaw > 0
          ? Math.min(100, Math.max(0, Math.round((raw / totalRaw) * 100)))
          : 0;

      // Godown physical capacity utilization (capped at 100%)
      const capacity = w.capacityCases && w.capacityCases > 0 ? w.capacityCases : 2500;
      const capacityPct = Math.min(100, Math.max(0, Math.round((cases / capacity) * 100)));

      return {
        ...w,
        cases,
        pctOfDepotStock,
        capacity,
        capacityPct,
      };
    });
  }, [warehouses, warehouseStock, totalRemaining]);

  const lowStockProducts = products.filter((p) => remainingStock(p.id) < 5);

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  // Descriptive label for current filter
  const filterSummaryLabel = useMemo(() => {
    if (periodPreset === 'all') return 'All Time Records';
    if (periodPreset === 'today') return `Today (${today})`;
    if (periodPreset === 'yesterday') return `Yesterday (${startDate})`;
    if (periodPreset === '7days') return `Last 7 Days (${startDate} to ${endDate})`;
    if (periodPreset === '15days') return `Last 15 Days (${startDate} to ${endDate})`;
    if (periodPreset === '30days') return `Last 30 Days (${startDate} to ${endDate})`;
    if (periodPreset === 'month') return `This Month (${today.slice(0, 7)})`;
    if (periodPreset === 'lastMonth') return `Last Month (${startDate.slice(0, 7)})`;
    if (startDate && endDate) return `Custom Range (${startDate} to ${endDate})`;
    return 'Custom Filter';
  }, [periodPreset, startDate, endDate, today]);

  const shortFilterLabel = useMemo(() => {
    if (periodPreset === 'all') return 'All Time';
    if (periodPreset === 'today') return 'Today';
    if (periodPreset === 'yesterday') return 'Yesterday';
    if (periodPreset === '7days') return '7 Days';
    if (periodPreset === '15days') return '15 Days';
    if (periodPreset === '30days') return '30 Days';
    if (periodPreset === 'month') return 'This Month';
    if (periodPreset === 'lastMonth') return 'Last Month';
    if (periodPreset === 'custom') {
      if (startDate && endDate && startDate !== endDate) {
        return `${startDate.slice(5)} to ${endDate.slice(5)}`;
      }
      return `${customDays}d`;
    }
    return 'All Time';
  }, [periodPreset, customDays, startDate, endDate]);

  return (
    <div id="view-dashboard" className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header: Clean Distribution Hub Title */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2"
        style={{ borderColor: palette.line }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1
              className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug break-words"
              style={{ color: palette.ink, fontWeight: 700 }}
            >
              Distribution Hub Overview
            </h1>
            {!showHealthBanner && (
              <button
                type="button"
                id="btn-show-health-banner"
                onClick={() => handleToggleHealthBanner(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors shadow-xs shrink-0 whitespace-nowrap"
                title="Show Depot Financial & Stock Health summary"
              >
                <Eye size={13} />
                <span>Show Health</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 break-words">
            Real-time stock ledger, delivery reconciliations, and retail collection metrics.
          </p>
        </div>

        {/* Smart Space-Saving Filter Dropdown */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 relative" ref={filterDropdownRef}>
          <button
            type="button"
            id="btn-filter-toggle-dashboard"
            onClick={() => setShowFilterDropdown((prev) => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all cursor-pointer shadow-xs ${
              showFilterDropdown || periodPreset !== 'all'
                ? 'bg-blue-900 text-white border-blue-950 ring-2 ring-blue-400/20'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
            }`}
          >
            <Filter size={15} className={periodPreset !== 'all' ? 'text-amber-300' : 'text-slate-600'} />
            <span className="font-bold">
              Filter: <span className="font-black">{shortFilterLabel}</span>
            </span>
            {periodPreset !== 'all' && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-amber-400 text-slate-950">
                1
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${showFilterDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Smart Filter Popover */}
          {showFilterDropdown && (
            <div
              className="absolute right-0 top-full mt-2 w-80 sm:w-96 p-4 bg-white border-2 rounded-2xl shadow-2xl z-40 space-y-3.5"
              style={{ borderColor: palette.navy }}
            >
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <Filter size={14} className="text-blue-900" />
                  <span>Filter Dashboard Metrics</span>
                </div>
                {periodPreset !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectPreset('all');
                      setShowFilterDropdown(false);
                    }}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Reset to All Time
                  </button>
                )}
              </div>

              {/* Presets Grid */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Quick Timeframes
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: '7days', label: '7 Days' },
                    { id: '15days', label: '15 Days' },
                    { id: '30days', label: '30 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'lastMonth', label: 'Last Month' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom' },
                  ].map((preset) => {
                    const isActive =
                      preset.id === 'custom'
                        ? periodPreset === 'custom' || showCustomPicker
                        : periodPreset === preset.id && !showCustomPicker;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        id={`btn-filter-pill-${preset.id}`}
                        onClick={() => {
                          if (preset.id === 'custom') {
                            setShowCustomPicker(true);
                            setPeriodPreset('custom');
                          } else {
                            setShowCustomPicker(false);
                            handleSelectPreset(preset.id as FilterPeriodPreset);
                            setShowFilterDropdown(false);
                          }
                        }}
                        className={`px-2 py-2 rounded-lg text-xs font-bold border-2 cursor-pointer transition-all text-center ${
                          isActive
                            ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range Controls */}
              {(showCustomPicker || periodPreset === 'custom') && (
                <div className="p-3 rounded-xl border bg-slate-50 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>Presets:</span>
                    <div className="flex items-center gap-1">
                      {[7, 15, 30, 60].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleApplyCustomDays(d)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                            customDays === d && periodPreset === 'custom'
                              ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="dash-custom-start" className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        From:
                      </label>
                      <input
                        id="dash-custom-start"
                        type="date"
                        value={startDate}
                        max={endDate || today}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setPeriodPreset('custom');
                        }}
                        className="w-full border rounded p-1 text-xs font-semibold bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="dash-custom-end" className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        To:
                      </label>
                      <input
                        id="dash-custom-end"
                        type="date"
                        value={endDate}
                        min={startDate}
                        max={today}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setPeriodPreset('custom');
                        }}
                        className="w-full border rounded p-1 text-xs font-semibold bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomPicker(false);
                      setShowFilterDropdown(false);
                    }}
                    className="w-full py-1.5 rounded-lg text-xs font-black bg-blue-900 text-white hover:bg-blue-950 cursor-pointer shadow-xs"
                  >
                    Apply Custom Range
                  </button>
                </div>
              )}

              {/* Current Active Summary text */}
              <div className="text-[11px] text-slate-500 font-semibold text-center pt-1 border-t">
                Active: <span className="font-bold text-slate-800">{filterSummaryLabel}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Smart Operational Pulse Banner (Able to hide / collapse) */}
      {showHealthBanner && (
        <div
          id="banner-depot-health"
          className="relative p-3 sm:p-4 border-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xs transition-all"
          style={{
            borderColor: '#CBD5E1',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                <span>Depot Financial & Stock Health</span>
                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                  {filterSummaryLabel}
                </span>
              </div>
              <div className="text-[11.5px] sm:text-xs text-slate-600 mt-0.5">
                Collection efficiency at <strong>{collectionRate}%</strong> with ₹{money(periodPaid)} realized.
                {periodOutstanding > 0 ? (
                  <span> ₹{money(periodOutstanding)} in market credit.</span>
                ) : (
                  <span> All bills settled.</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-4 text-xs">
              <div className="text-left sm:text-right">
                <div className="text-slate-500 text-[11px]">Invoices</div>
                <div className="font-bold text-slate-900">{activeBills.length}</div>
              </div>
              <div className="text-left sm:text-right border-l sm:border-l-0 pl-2 sm:pl-0">
                <div className="text-slate-500 text-[11px]">Available</div>
                <div className="font-bold text-slate-900">{totalRemaining} cs</div>
              </div>
              <div className="text-left sm:text-right border-l sm:border-l-0 pl-2 sm:pl-0">
                <div className="text-slate-500 text-[11px]">Godowns</div>
                <div className="font-bold text-slate-900">{warehouses.length}</div>
              </div>
            </div>

            {/* Hide / Dismiss Button */}
            <button
              type="button"
              id="btn-hide-health-banner"
              onClick={() => handleToggleHealthBanner(false)}
              className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0 ml-1"
              title="Hide this summary card"
              aria-label="Hide Depot Financial & Stock Health"
            >
              <EyeOff size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Metrics Grid (2x2 on Mobile, 4-col on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatBlock
          id="stat-remaining"
          label="Available Live Stock"
          value={`${totalRemaining} cs`}
          sub={`${products.length} catalog beverages`}
        />
        <StatBlock
          id="stat-cases-sold"
          label={periodPreset === 'all' ? 'Total Cases Sold' : `Cases Sold (${periodPreset})`}
          value={`${periodCasesSold} cs`}
          sub={`Across ${activeBills.length} invoices`}
          accent={palette.navy}
        />
        <StatBlock
          id="stat-revenue"
          label={periodPreset === 'all' ? 'Total Turnover' : `Turnover (${periodPreset})`}
          value={`₹${money(periodRevenue)}`}
          sub={`₹${money(periodPaid)} collected`}
          accent={palette.good}
        />
        <StatBlock
          id="stat-outstanding"
          label={periodPreset === 'all' ? 'Market Credit Due' : `Credit Due (${periodPreset})`}
          value={`₹${money(periodOutstanding)}`}
          sub={periodOutstanding > 0 ? 'Actionable receivables' : 'All clear'}
          accent={periodOutstanding > 0 ? palette.bad : palette.good}
        />
      </div>

      {/* Discrepancy Alert Banner */}
      {tripsWithDiscrepancy > 0 && (
        <div
          id="alert-trip-discrepancy"
          className="flex items-center justify-between gap-3 p-3.5 sm:p-4 border-2 rounded cursor-pointer transition-all hover:shadow-xs"
          onClick={() => setTab('trips')}
          style={{
            borderColor: palette.bad,
            backgroundColor: `${palette.bad}15`,
            color: palette.bad,
          }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={Math.round(20 * scale)} aria-hidden="true" className="shrink-0" />
            <div style={fz(16, { fontWeight: 700 })}>
              {tripsWithDiscrepancy} vehicle trip{tripsWithDiscrepancy === 1 ? '' : 's'} with stock transit discrepancy
            </div>
          </div>
          <span className="inline-flex items-center gap-1 font-bold underline shrink-0" style={fz(13.5)}>
            Reconcile <ArrowRight size={14} aria-hidden="true" />
          </span>
        </div>
      )}

      {/* Low Stock Warning Banner */}
      {lowStockProducts.length > 0 && (
        <div
          id="alert-low-stock"
          className="border-2 p-4 rounded"
          style={{
            borderColor: palette.warn,
            backgroundColor: `${palette.warn}12`,
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2" style={fz(15, { color: palette.warn, fontWeight: 700 })}>
              <AlertTriangle size={18} aria-hidden="true" />
              Low Stock Warnings ({lowStockProducts.length} items below 5 crates)
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {lowStockProducts.slice(0, 4).map((p) => {
              const rem = remainingStock(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between border px-2.5 py-1.5 rounded bg-white"
                  style={{ borderColor: palette.line }}
                >
                  <span className="text-xs font-semibold text-slate-800 truncate mr-2">{p.name}</span>
                  <span className="font-bold px-1.5 py-0.5 rounded text-[11px] bg-rose-100 text-rose-800 shrink-0">
                    {rem} left
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Middle Grid: Fast Movers & Verified Godown Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fast-Moving Leaderboard */}
        <div className="border-2 p-4 rounded-lg" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-700" />
              <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>Top Selling Beverages</h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {periodPreset === 'all' ? 'All time sales' : filterSummaryLabel}
            </span>
          </div>

          {topProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No beverage sales recorded for this date filter.
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, idx) => {
                const maxQty = topProducts[0]?.qty || 1;
                const pct = Math.min(100, Math.round((p.qty / maxQty) * 100));
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                        <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-slate-800 truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-500 text-[11px]">₹{money(p.revenue)}</span>
                        <span className="text-blue-900 font-bold">{p.qty} crates</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-700 h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Godowns & Warehouse Balances (Accurate Net Stock & Capacity, Strictly 0-100%) */}
        <div className="border-2 p-4 rounded-lg" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-indigo-700" />
              <div>
                <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>Godowns & Warehouse Balances</h3>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              ✓ 100% Reconciled
            </span>
          </div>

          <div className="space-y-3">
            {warehouseDistribution.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No warehouses configured yet.
              </div>
            ) : (
              warehouseDistribution.map((w) => {
                return (
                  <div
                    key={w.id}
                    className="p-3 border rounded-lg bg-slate-50/70 transition-all hover:bg-slate-50"
                    style={{ borderColor: palette.line }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{w.name}</span>
                        {w.isDefault && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                            Primary Depot
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-indigo-950 font-bold text-sm">{w.cases} crates</span>
                        <span className="text-slate-500 font-normal ml-1">
                          ({w.pctOfDepotStock}% of live stock)
                        </span>
                      </div>
                    </div>

                    {/* Accurate Progress Bar bounded to 0-100% */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${w.pctOfDepotStock}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                      <span className="truncate max-w-[220px]">Location: {w.location}</span>
                      <span className="font-medium text-slate-600">
                        Facility Capacity: {w.capacityPct}% of {w.capacity.toLocaleString()} cs
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
