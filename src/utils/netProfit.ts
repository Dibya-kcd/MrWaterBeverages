import type { BusinessExpenseRecord as BusinessExpense } from './storage';

export type ExpenseCategory = string;

/** Same categories the Business reports screen has always used, plus commission. */
export const EXPENSE_LABELS: Record<string, string> = {
  fuel: 'Fuel',
  salary: 'Salary',
  driver: 'Driver / helper wages',
  commission: 'Commission / incentive',
  rent: 'Rent',
  electricity: 'Electricity',
  transport: 'Transport / vehicle',
  toll: 'Toll / parking / challan',
  repair: 'Vehicle repair / service',
  packaging: 'Packaging / loading',
  baddebt: 'Bad debt (dues that will not be paid)',
  misc: 'Miscellaneous',
};
export const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_LABELS);

/** Expenses that are pay to people. Everything else is an operating cost. */
export const PAY_CATEGORIES: string[] = ['salary', 'driver', 'commission'];

export interface NetProfitInput {
  /** Gross profit on sales, ex-GST, already after stock write-offs (from the margin report). */
  grossProfitAfterLosses: number;
  expenses: BusinessExpense[];
  /** Supplier scheme / incentive credit notes actually received in the period. */
  supplierCreditsReceived?: number;
}

export interface NetProfitResult {
  byCategory: Record<string, number>;
  operatingCosts: number; // fuel, rent, vehicle, ... (not pay)
  payPaid: number; // salary + commission already paid
  supplierCredits: number;
  profitBeforePay: number; // what is available to share as pay
  netProfit: number; // after pay already paid
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeNetProfit(input: NetProfitInput): NetProfitResult {
  const byCategory: Record<string, number> = Object.fromEntries(EXPENSE_CATEGORY_KEYS.map((k) => [k, 0]));
  for (const e of input.expenses) {
    const cat = byCategory[e.category] !== undefined ? e.category : 'misc';
    byCategory[cat] += Math.max(0, Number(e.amount) || 0);
  }
  const payPaid = PAY_CATEGORIES.reduce((s, c) => s + byCategory[c], 0);
  const operatingCosts = Object.keys(byCategory)
    .filter((c) => !PAY_CATEGORIES.includes(c))
    .reduce((s, c) => s + byCategory[c], 0);
  const supplierCredits = Math.max(0, Number(input.supplierCreditsReceived) || 0);
  const profitBeforePay = input.grossProfitAfterLosses + supplierCredits - operatingCosts;
  return {
    byCategory,
    operatingCosts: r2(operatingCosts),
    payPaid: r2(payPaid),
    supplierCredits: r2(supplierCredits),
    profitBeforePay: r2(profitBeforePay),
    netProfit: r2(profitBeforePay - payPaid),
  };
}

/**
 * How much can be shared as pay: a percentage of the profit available before pay (never negative),
 * minus what has already been paid. `remaining` can go negative = already paid more than the pool.
 */
export function salaryPool(profitBeforePay: number, percent: number, alreadyPaid: number) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const pool = r2(Math.max(0, profitBeforePay) * (pct / 100));
  return { pool, remaining: r2(pool - Math.max(0, alreadyPaid)) };
}
