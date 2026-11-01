/**
 * Indian Standard Time (IST, UTC+5:30) date helpers.
 *
 * `new Date().toISOString().slice(0, 10)` gives the UTC date, which in India
 * is still "yesterday" between 00:00 and 05:30 local time.
 * Payments, invoices, delivery trips, and "today" reports strictly use IST.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of a Date in Indian Standard Time (Asia/Kolkata). */
export function toLocalISODate(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

/** Today's date in Indian Standard Time (IST) as YYYY-MM-DD. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** Current time formatted in IST. */
export function nowISTString(): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  } catch {
    return new Date().toLocaleString("en-IN");
  }
}
