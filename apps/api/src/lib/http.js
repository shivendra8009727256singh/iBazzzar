// Small HTTP helpers shared by route modules.
import { DomainError } from '../../../../packages/shared/src/index.js';

export function pageParams(query, { size = 24, max = 100 } = {}) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1));
  const take = Math.max(1, Math.min(max, Number.parseInt(query.limit, 10) || size));
  return { page, take, skip: (page - 1) * take };
}

export const pageResult = (items, total, { page, take }) => ({ items, total, page, pages: Math.max(1, Math.ceil(total / take)) });

export const notFound = (what = 'Record') => new DomainError(`${what} not found`, 404);

/** CSV with quoted cells; cells a spreadsheet would execute as formulas are neutralised. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = (v) => {
    let s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [head.map(cell).join(','), ...rows.map((r) => head.map((h) => cell(r[h])).join(','))].join('\r\n');
}

export const rupees = (paise) => (paise / 100).toFixed(2);
export const shortRef = (id) => String(id).slice(0, 8).toUpperCase();
export const slugify = (text) => String(text).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const ilike = (q) => ({ contains: q, mode: 'insensitive' });
