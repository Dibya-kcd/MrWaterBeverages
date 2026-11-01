import { todayISO } from "./dateLocal";
/**
 * Shared input validation for MrWater forms.
 * Pure helpers — no React dependency. Safe to use in context and views.
 */

export type FieldErrors = Record<string, string>;

export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

export function required(value: unknown, label = "This field"): string | null {
  if (isEmpty(value)) return `${label} is required`;
  return null;
}

/** Indian mobile: 10 digits, optional +91 / 0 prefix */
export function normalizePhone(raw: string): string {
  return (raw || "").replace(/[\s\-().]/g, "");
}

export function isValidPhone(
  raw: string,
  opts?: { required?: boolean },
): boolean {
  const s = normalizePhone(raw);
  if (!s) return !opts?.required;
  // +91XXXXXXXXXX or 0XXXXXXXXXX or 10 digits starting 6-9
  if (/^\+91[6-9]\d{9}$/.test(s)) return true;
  if (/^0[6-9]\d{9}$/.test(s)) return true;
  if (/^[6-9]\d{9}$/.test(s)) return true;
  // Allow landline-ish 6–12 digits for older shop numbers
  if (/^\d{6,12}$/.test(s)) return true;
  return false;
}

export function validatePhone(
  raw: string,
  opts?: { required?: boolean; label?: string },
): string | null {
  const label = opts?.label || "Phone";
  const s = (raw || "").trim();
  if (!s) return opts?.required ? `${label} is required` : null;
  if (!isValidPhone(s, { required: true })) {
    return `${label} looks invalid — use 10-digit mobile (e.g. 9876543210)`;
  }
  return null;
}

export function isValidEmail(raw: string): boolean {
  const s = (raw || "").trim();
  if (!s) return true;
  // Practical email check (not full RFC)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(s);
}

export function validateEmail(
  raw: string,
  opts?: { required?: boolean; label?: string },
): string | null {
  const label = opts?.label || "Email";
  const s = (raw || "").trim();
  if (!s) return opts?.required ? `${label} is required` : null;
  if (!isValidEmail(s)) return `${label} is not a valid address`;
  return null;
}

/** GSTIN: 15 chars — 2 digit state + 10 PAN + entity + Z + check */
export function normalizeGstin(raw: string): string {
  return (raw || "").replace(/\s/g, "").toUpperCase();
}

export function isValidGstin(raw: string): boolean {
  const s = normalizeGstin(raw);
  if (!s) return true; // optional by default
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s);
}

export function validateGstin(
  raw: string,
  opts?: { required?: boolean; label?: string },
): string | null {
  const label = opts?.label || "GSTIN";
  const s = normalizeGstin(raw);
  if (!s) return opts?.required ? `${label} is required` : null;
  if (!isValidGstin(s)) {
    return `${label} must be 15 characters (e.g. 21ABCDE1234F1Z5)`;
  }
  return null;
}

export function isValidDateISO(raw: string): boolean {
  const s = (raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // Parse as UTC: local-midnight + toISOString() shifts a day back east of UTC (e.g. India).
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateDate(
  raw: string,
  opts?: { required?: boolean; label?: string; notFuture?: boolean },
): string | null {
  const label = opts?.label || "Date";
  const s = (raw || "").trim();
  if (!s) return opts?.required ? `${label} is required` : null;
  if (!isValidDateISO(s)) return `${label} must be a valid date (YYYY-MM-DD)`;
  if (opts?.notFuture) {
    const today = todayISO();
    if (s > today) return `${label} cannot be in the future`;
  }
  return null;
}

export function validateNonNegativeNumber(
  raw: string | number,
  opts?: {
    required?: boolean;
    label?: string;
    max?: number;
    allowZero?: boolean;
  },
): string | null {
  const label = opts?.label || "Amount";
  if (raw === "" || raw == null) {
    return opts?.required ? `${label} is required` : null;
  }
  const n =
    typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (n < 0) return `${label} cannot be negative`;
  if (opts?.allowZero === false && n === 0)
    return `${label} must be greater than zero`;
  if (opts?.max != null && n > opts.max)
    return `${label} cannot exceed ${opts.max}`;
  return null;
}

export function validatePositiveInt(
  raw: string | number,
  opts?: { required?: boolean; label?: string; max?: number },
): string | null {
  const label = opts?.label || "Quantity";
  if (raw === "" || raw == null) {
    return opts?.required ? `${label} is required` : null;
  }
  const n = typeof raw === "number" ? raw : Number(String(raw));
  if (!Number.isFinite(n) || !Number.isInteger(n))
    return `${label} must be a whole number`;
  if (n <= 0) return `${label} must be at least 1`;
  if (opts?.max != null && n > opts.max)
    return `${label} cannot exceed ${opts.max}`;
  return null;
}

export function firstError(
  ...msgs: (string | null | undefined)[]
): string | null {
  for (const m of msgs) {
    if (m) return m;
  }
  return null;
}

export function collectErrors(
  entries: [string, string | null | undefined][],
): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, msg] of entries) {
    if (msg) out[key] = msg;
  }
  return out;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* ---------- Domain form validators ---------- */

export interface CustomerFormInput {
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  gstin?: string;
  creditLimit?: string | number;
  openingBalance?: string | number;
}

export function validateCustomerForm(data: CustomerFormInput): FieldErrors {
  const cleanPhone = (data.phone || "").trim();
  return collectErrors([
    ["name", required(data.name, "Shop / retailer name")],
    [
      "phone",
      cleanPhone
        ? validatePhone(cleanPhone, { required: false, label: "Primary phone" })
        : null,
    ],
    [
      "altPhone",
      data.altPhone?.trim()
        ? validatePhone(data.altPhone.trim(), { label: "Alt phone" })
        : null,
    ],
    ["email", validateEmail(data.email || "", { label: "Email" })],
    ["gstin", validateGstin(data.gstin || "", { label: "GSTIN" })],
    [
      "creditLimit",
      validateNonNegativeNumber(data.creditLimit ?? "", {
        label: "Credit limit",
        max: 10_000_000,
      }),
    ],
    [
      "openingBalance",
      validateNonNegativeNumber(data.openingBalance ?? "", {
        label: "Opening balance",
        max: 10_000_000,
      }),
    ],
  ]);
}

export interface BillDraftInput {
  retailer: string;
  phone?: string;
  date?: string;
  itemCount: number;
  total?: number;
  amountPaid?: number;
}

export function validateBillDraft(data: BillDraftInput): FieldErrors {
  const errors = collectErrors([
    [
      "date",
      data.date
        ? validateDate(data.date, { label: "Sale date", notFuture: false })
        : null,
    ],
    [
      "items",
      data.itemCount <= 0 ? "Add at least one product to the bill" : null,
    ],
    [
      "amountPaid",
      data.amountPaid != null
        ? validateNonNegativeNumber(data.amountPaid, { label: "Amount paid" })
        : null,
    ],
  ]);

  const name = (data.retailer || "").trim();
  const isCash =
    !name ||
    name.toLowerCase() === "cash sale" ||
    name.toLowerCase() === "spot cash";

  if (!isCash && data.phone) {
    const pe = validatePhone(data.phone, {
      required: false,
      label: "Customer phone",
    });
    if (pe) errors.phone = pe;
  }

  if (
    data.total != null &&
    data.amountPaid != null &&
    data.amountPaid > data.total + 0.05
  ) {
    errors.amountPaid = "Amount paid cannot exceed bill total";
  }

  return errors;
}

export interface PaymentFormInput {
  amount: string | number;
  paymentDate: string;
  customerName?: string;
}

export function validatePaymentForm(data: PaymentFormInput): FieldErrors {
  return collectErrors([
    [
      "amount",
      validateNonNegativeNumber(data.amount, {
        required: true,
        label: "Payment amount",
        allowZero: false,
      }),
    ],
    [
      "paymentDate",
      validateDate(data.paymentDate, {
        required: true,
        label: "Payment date",
        notFuture: true,
      }),
    ],
    [
      "customerName",
      data.customerName != null
        ? required(data.customerName, "Customer")
        : null,
    ],
  ]);
}

export interface OrgProfileInput {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

export function validateOrgProfile(data: OrgProfileInput): FieldErrors {
  return collectErrors([
    ["name", required(data.name, "Business name")],
    [
      "phone",
      data.phone ? validatePhone(data.phone, { label: "Phone" }) : null,
    ],
    ["email", validateEmail(data.email || "", { label: "Email" })],
    ["gstin", validateGstin(data.gstin || "", { label: "GSTIN" })],
  ]);
}

/** Format first error message for toast / notice */
export function summarizeErrors(errors: FieldErrors): string {
  const vals = Object.values(errors);
  if (vals.length === 0) return "";
  if (vals.length === 1) return vals[0];
  return (
    vals.slice(0, 3).join("\n") +
    (vals.length > 3 ? `\n+${vals.length - 3} more` : "")
  );
}
