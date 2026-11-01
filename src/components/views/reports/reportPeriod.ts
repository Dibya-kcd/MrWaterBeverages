/** Report period model + helpers (moved out of ReportsView.tsx unchanged). */
import { PeriodFilter, type PeriodRange, type FilterPeriodPreset } from "../../common/PeriodFilter";
import { todayISO } from "../../../utils/dateLocal";

export type ReportPeriod =
  | "customDate"
  | "today"
  | "yesterday"
  | "customRange"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "all";

/** Map shared PeriodFilter presets onto ReportsView period model. */
export function reportPeriodFromFilter(range: PeriodRange): {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  selectedDate: string;
} {
  const preset = range.preset;
  if (preset === "today")
    return {
      period: "today",
      startDate: range.startDate,
      endDate: range.endDate,
      selectedDate: range.endDate,
    };
  if (preset === "yesterday")
    return {
      period: "yesterday",
      startDate: range.startDate,
      endDate: range.endDate,
      selectedDate: range.endDate,
    };
  if (preset === "7days")
    return {
      period: "last7",
      startDate: range.startDate,
      endDate: range.endDate,
      selectedDate: range.endDate,
    };
  if (preset === "month")
    return {
      period: "thisMonth",
      startDate: range.startDate,
      endDate: range.endDate,
      selectedDate: range.endDate,
    };
  if (preset === "lastMonth")
    return {
      period: "lastMonth",
      startDate: range.startDate,
      endDate: range.endDate,
      selectedDate: range.endDate,
    };
  if (preset === "all")
    return {
      period: "all",
      startDate: "",
      endDate: "",
      selectedDate: range.endDate || todayISO(),
    };
  // 15/30/custom → customRange
  return {
    period: "customRange",
    startDate: range.startDate,
    endDate: range.endDate,
    selectedDate: range.endDate,
  };
}

/** Number of days in an inclusive YYYY-MM-DD range (0 if either end is missing). */
export function inclusiveDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function filterPresetFromReportPeriod(
  period: ReportPeriod,
): FilterPeriodPreset {
  if (period === "today") return "today";
  if (period === "yesterday") return "yesterday";
  if (period === "last7") return "7days";
  if (period === "thisMonth") return "month";
  if (period === "lastMonth") return "lastMonth";
  if (period === "all") return "all";
  if (period === "customRange") return "custom";
  return "custom";
}

/** A custom range of exactly 15 / 30 days is shown as that preset, so the label matches the pick. */
export function filterPresetForRange(
  period: ReportPeriod,
  startDate: string,
  endDate: string,
): { preset: FilterPeriodPreset; customDays: number } {
  if (period !== "customRange") return { preset: filterPresetFromReportPeriod(period), customDays: 15 };
  const days = inclusiveDays(startDate, endDate);
  if (days === 15) return { preset: "15days", customDays: 15 };
  if (days === 30) return { preset: "30days", customDays: 30 };
  return { preset: "custom", customDays: days || 15 };
}

