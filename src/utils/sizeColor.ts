import { volumeFromName, detectPack } from './billing';

/**
 * One colour per bottle size, so 150ml / 185ml / 500ml / 600ml / 1L ... of the same
 * drink are told apart at a glance in the product list and in carts.
 * Class names are written out in full so Tailwind can see them.
 */
export interface SizeTheme {
  /** e.g. "500ml" or "1L" ('' when the size is unknown) */
  label: string;
  /** solid colour, used for the left stripe */
  hex: string;
  /** chip classes (background + text + border) */
  chip: string;
}

const BUCKETS: { max: number; hex: string; chip: string }[] = [
  { max: 170, hex: '#e11d48', chip: 'bg-rose-100 text-rose-900 border-rose-400' }, // 150
  { max: 220, hex: '#ea580c', chip: 'bg-orange-100 text-orange-900 border-orange-400' }, // 180-200
  { max: 280, hex: '#ca8a04', chip: 'bg-yellow-100 text-yellow-900 border-yellow-500' }, // 250
  { max: 350, hex: '#65a30d', chip: 'bg-lime-100 text-lime-900 border-lime-500' }, // 300-330
  { max: 450, hex: '#16a34a', chip: 'bg-green-100 text-green-900 border-green-500' }, // 400
  { max: 550, hex: '#0d9488', chip: 'bg-teal-100 text-teal-900 border-teal-500' }, // 500
  { max: 650, hex: '#0891b2', chip: 'bg-cyan-100 text-cyan-900 border-cyan-500' }, // 600
  { max: 850, hex: '#2563eb', chip: 'bg-blue-100 text-blue-900 border-blue-500' }, // 750
  { max: 1100, hex: '#4f46e5', chip: 'bg-indigo-100 text-indigo-900 border-indigo-500' }, // 1L
  { max: 1700, hex: '#7c3aed', chip: 'bg-violet-100 text-violet-900 border-violet-500' }, // 1.25-1.5L
  { max: 2100, hex: '#c026d3', chip: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-500' }, // 2L
  { max: Infinity, hex: '#db2777', chip: 'bg-pink-100 text-pink-900 border-pink-500' }, // 2.25L+
];

const UNKNOWN: Omit<SizeTheme, 'label'> = {
  hex: '#94a3b8',
  chip: 'bg-slate-100 text-slate-700 border-slate-300',
};

/** Left stripe in the size colour. Spread into a row's `style` so every list uses the same stripe. */
export function sizeStripe(volume?: number | null, name?: string | null): {
  borderLeftWidth: number;
  borderLeftStyle: 'solid';
  borderLeftColor: string;
} {
  return { borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: sizeTheme(volume, name).hex };
}

export function sizeTheme(volume?: number | null, name?: string | null): SizeTheme {
  const vol = (Number(volume) > 0 ? Number(volume) : name ? volumeFromName(name) : null) || 0;
  if (vol <= 0) return { label: '', ...UNKNOWN };
  const b = BUCKETS.find((x) => vol <= x.max)!;
  const label = vol >= 1000 && vol % 1000 === 0 ? `${vol / 1000}L` : vol >= 1000 ? `${+(vol / 1000).toFixed(2)}L` : `${vol}ml`;
  return { label, hex: b.hex, chip: b.chip };
}

/**
 * Pack type colour (solid, white text) so Can / PET / Glass / Tetra differ at a glance.
 * Solid fill on purpose: size chips are pale, pack chips are bold, so the two never look alike.
 */
export interface PackTheme {
  label: string;
  chip: string;
}

export function packTheme(pack?: string | null, name?: string | null): PackTheme {
  const raw = pack && pack.trim() && pack !== 'pcs' ? pack.trim() : name ? detectPack(name) : '';
  const k = raw.toLowerCase();
  if (!k) return { label: '', chip: '' };
  if (k.includes('can') || k.includes('tin')) return { label: 'Can', chip: 'bg-blue-600 text-white border-blue-800 shadow-2xs font-black' };
  if (k.includes('pet') || k.includes('plastic') || k.includes('bottle'))
    return { label: 'PET', chip: 'bg-red-600 text-white border-red-800 shadow-2xs font-black' };
  if (k.includes('glass') || k.includes('rgb')) return { label: raw, chip: 'bg-emerald-700 text-white border-emerald-900 shadow-2xs font-black' };
  if (k.includes('tetra') || k.includes('pouch') || k.includes('brick'))
    return { label: raw, chip: 'bg-amber-600 text-white border-amber-800 shadow-2xs font-black' };
  return { label: raw, chip: 'bg-slate-600 text-white border-slate-800 shadow-2xs font-black' };
}
