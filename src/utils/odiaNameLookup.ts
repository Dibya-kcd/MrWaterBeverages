/**
 * Lets the receipt find a product's saved Odia name (`nameOr`) without every caller having to pass the product list.
 * The ledger provider keeps this up to date whenever products change (see LedgerContext).
 */
type Lookup = (productId: number | undefined, englishName: string) => string;

let lookup: Lookup = () => '';
let fontRequested = false;

export function setOdiaNameLookup(fn: Lookup): void {
  lookup = fn;
}

/** Saved Odia name for the product, or '' when none has been entered. */
export function lookupOdiaName(productId: number | undefined, englishName: string): string {
  try {
    return (lookup(productId, englishName) || '').trim();
  } catch {
    return '';
  }
}

/** Starts loading the Odia web font in the background so receipts drawn later use it (system Odia fonts are the fallback). */
export function warmOdiaFont(): void {
  if (fontRequested || typeof document === 'undefined' || !(document as Document & { fonts?: FontFaceSet }).fonts) return;
  fontRequested = true;
  try {
    void document.fonts.load('700 20px "Noto Sans Oriya"', '\u0B05\u0B06');
  } catch {
    /* fall back to the device's own Odia font */
  }
}
