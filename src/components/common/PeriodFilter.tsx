import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Filter, X } from "lucide-react";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";

export type FilterPeriodPreset =
  | "today"
  | "yesterday"
  | "7days"
  | "15days"
  | "30days"
  | "month"
  | "lastMonth"
  | "all"
  | "custom";

export interface PeriodRange {
  preset: FilterPeriodPreset;
  startDate: string; // YYYY-MM-DD or ''
  endDate: string; // YYYY-MM-DD or ''
  customDays?: number;
}

export interface PeriodFilterProps {
  value: PeriodRange;
  onChange: (next: PeriodRange) => void;
  /** Compact trigger for toolbars */
  compact?: boolean;
  /**
   * The "month" preset normally means "last 30 days" (Dashboard). Screens where it means the
   * current calendar month (Reports) set this, so the list shows "This month" and does not show
   * "Last 30 days" twice.
   */
  monthIsCalendar?: boolean;
  className?: string;
}

const PRESETS: { id: FilterPeriodPreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7days", label: "Last 7 days" },
  { id: "15days", label: "Last 15 days" },
  { id: "30days", label: "Last 30 days" },
  { id: "month", label: "Last 30 days" },
  { id: "lastMonth", label: "Last month" },
  { id: "custom", label: "Custom days" },
];

function todayStr(): string {
  return todayISO();
}

function pastDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toLocalISODate(d);
}

/** Compute start/end dates for a preset (shared so all screens stay consistent). */
export function rangeForPreset(
  preset: FilterPeriodPreset,
  customDays = 15,
): { startDate: string; endDate: string } {
  const today = todayStr();
  switch (preset) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const y = pastDateStr(1);
      return { startDate: y, endDate: y };
    }
    case "7days":
      return { startDate: pastDateStr(6), endDate: today };
    case "15days":
      return { startDate: pastDateStr(14), endDate: today };
    case "30days":
      return { startDate: pastDateStr(29), endDate: today };
    case "month":
      return { startDate: pastDateStr(29), endDate: today };
    case "lastMonth": {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      return {
        startDate: `${y}-${m}-01`,
        endDate: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    case "custom":
      return { startDate: pastDateStr(customDays - 1), endDate: today };
    case "all":
    default:
      return { startDate: "", endDate: "" };
  }
}

export function periodLabel(value: PeriodRange, monthIsCalendar = false): string {
  const { preset, startDate, endDate, customDays } = value;
  switch (preset) {
    case "all":
      return "All time";
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "7days":
      return "7 days";
    case "15days":
      return "15 days";
    case "30days":
      return "30 days";
    case "month":
      return monthIsCalendar ? "This month" : "Last 30 days";
    case "lastMonth":
      return "Last month";
    case "custom":
      return customDays
        ? `Last ${customDays} days`
        : startDate && endDate
          ? `${startDate} → ${endDate}`
          : "Custom";
    default:
      return "Period";
  }
}

/**
 * Shared period filter dropdown used by Dashboard and other list/report screens.
 * Keeps presets and date math identical across the app.
 */
export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  value,
  onChange,
  compact = false,
  className = "",
  monthIsCalendar = false,
}) => {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(value.preset === "custom");
  const [customDays, setCustomDays] = useState(value.customDays ?? 15);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = useMemo(() => periodLabel(value, monthIsCalendar), [value, monthIsCalendar]);

  // One row per meaning: never list two presets with the same name.
  const presets = useMemo(
    () =>
      PRESETS.filter((p) => monthIsCalendar || p.id !== "month").map((p) =>
        p.id === "month" && monthIsCalendar ? { ...p, label: "This month" } : p,
      ),
    [monthIsCalendar],
  );
  const isFiltered = value.preset !== "all";

  const applyPreset = (preset: FilterPeriodPreset) => {
    if (preset === "custom") {
      setShowCustom(true);
      const range = rangeForPreset("custom", customDays);
      onChange({ preset: "custom", customDays, ...range });
      return;
    }
    setShowCustom(false);
    const range = rangeForPreset(preset);
    onChange({ preset, customDays, ...range });
    setOpen(false);
  };

  const applyCustomDays = (days: number) => {
    setCustomDays(days);
    const range = rangeForPreset("custom", days);
    onChange({ preset: "custom", customDays: days, ...range });
  };

  const clear = () => {
    setShowCustom(false);
    onChange({ preset: "all", startDate: "", endDate: "", customDays });
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-xl border font-medium transition-colors cursor-pointer ${
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
        } ${
          isFiltered
            ? "bg-amber-50 border-amber-300 text-amber-900"
            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Filter
          className={compact ? "w-3.5 h-3.5" : "w-4 h-4"}
          aria-hidden="true"
        />
        <span className="truncate max-w-[9rem]">{label}</span>
        {isFiltered && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                clear();
              }
            }}
            className="ml-0.5 p-0.5 rounded hover:bg-amber-100"
            aria-label="Clear period filter"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Period presets"
          className="absolute right-0 mt-1.5 z-50 w-56 rounded-xl border border-[var(--border)] bg-white shadow-lg py-1.5 text-sm"
        >
          {presets.map((p) => {
            const active =
              p.id === "custom"
                ? value.preset === "custom" || showCustom
                : (value.preset === p.id ||
                    (!monthIsCalendar && p.id === "30days" && value.preset === "month")) &&
                  !showCustom;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => applyPreset(p.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  active
                    ? "bg-sky-50 text-sky-800 font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.id === "custom" ? (
                  <Calendar
                    className="w-3.5 h-3.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="w-3.5" />
                )}
                {p.label}
              </button>
            );
          })}

          {(showCustom || value.preset === "custom") && (
            <div className="border-t border-slate-100 px-3 py-2.5 mt-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Last N days
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[7, 15, 30, 45, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => applyCustomDays(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                      customDays === d && value.preset === "custom"
                        ? "bg-[var(--ink)] text-[var(--sidebar-text)] border-sky-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
