/**
 * One deterministic rounding rule for the whole tax engine: round half away from zero to 2 decimals.
 * A tiny epsilon removes binary floating point artefacts such as 1.005 * 100 = 100.49999999999999.
 */
export function r2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const paise = Math.round(Math.abs(n) * 100 + 1e-7);
  return (sign * paise) / 100;
}

export const sum = (xs: number[]): number => r2(xs.reduce((s, x) => s + x, 0));
