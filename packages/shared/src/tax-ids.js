// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', then a base-36 checksum character.
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function isValidGstin(value) {
  const gstin = String(value || '').toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
  const state = Number(gstin.slice(0, 2));
  if (state < 1 || (state > 38 && state !== 97 && state !== 99)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GST_CHARS.indexOf(gstin[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

export const isValidPan = (value) => /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/.test(String(value || '').toUpperCase());
export const panFromGstin = (gstin) => String(gstin).toUpperCase().slice(2, 12);
export const isValidIfsc = (value) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || '').toUpperCase());
