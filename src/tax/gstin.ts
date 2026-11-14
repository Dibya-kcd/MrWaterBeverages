/** GSTIN structure + checksum validation, and the GST state-code reference table. */

export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Check character of the first 14 characters (mod-36 weighted algorithm used by the GST system). */
export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const v = ALPHABET.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (total % 36)) % 36];
}

export interface GstinCheck {
  valid: boolean;
  gstin: string;
  stateCode?: string;
  pan?: string;
  reason?: string;
}

export function validateGstin(raw?: string | null): GstinCheck {
  const gstin = String(raw ?? '').trim().toUpperCase();
  if (!gstin) return { valid: false, gstin, reason: 'GSTIN is empty' };
  if (gstin.length !== 15) return { valid: false, gstin, reason: 'GSTIN must be 15 characters' };
  if (!GSTIN_SHAPE.test(gstin)) return { valid: false, gstin, reason: 'GSTIN format is invalid' };
  const stateCode = gstin.slice(0, 2);
  if (!GST_STATE_CODES[stateCode]) return { valid: false, gstin, reason: `Unknown GST state code ${stateCode}` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14])
    return { valid: false, gstin, reason: 'GSTIN check character does not match (typing error?)' };
  return { valid: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}

/** HSN must be 4, 6 or 8 digits (turnover-based digit requirement is a compliance setting, not checked here). */
export function validateHsn(raw?: string | null): boolean {
  return /^\d{4}(\d{2}(\d{2})?)?$/.test(String(raw ?? '').trim());
}
