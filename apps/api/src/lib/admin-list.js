// Shared behaviour for admin tables: whitelisted sorting, date range, page size, and CSV export of the same filtered query.
import { z } from 'zod';
import { DomainError } from '../../../../packages/shared/src/index.js';
import { toCsv } from './http.js';

const PAGE_SIZES = [25, 50, 100];
const EXPORT_LIMIT = 10_000;

const base = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().refine((n) => PAGE_SIZES.includes(n), 'Page size must be 25, 50 or 100').default(25),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(120).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** India-time day boundaries for a from/to date range (inclusive of the whole "to" day). */
export function dateRange(from, to) {
  const range = {};
  if (from) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) range.lt = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000);
  return Object.keys(range).length ? range : undefined;
}

/**
 * Parses table query params.
 * @param sorts map of public sort key → Prisma orderBy builder (dir) → object. The first key is the default.
 */
export function listParams(query, sorts) {
  const p = base.parse(query);
  const keys = Object.keys(sorts);
  const sortKey = p.sort && keys.includes(p.sort) ? p.sort : keys[0];
  if (p.sort && !keys.includes(p.sort)) throw new DomainError(`Can’t sort by “${p.sort}”`, 400);
  return {
    ...p,
    sortKey,
    orderBy: sorts[sortKey](p.dir),
    createdAt: dateRange(p.from, p.to),
    skip: p.format === 'csv' ? 0 : (p.page - 1) * p.limit,
    take: p.format === 'csv' ? EXPORT_LIMIT : p.limit,
  };
}

/** Sends either a JSON page or a CSV of the same rows. */
export function sendList(res, p, { key, rows, total, toCsvRow, filename, extra = {} }) {
  if (p.format === 'csv') {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ibazzzar-${filename}-${new Date().toISOString().slice(0, 10)}.csv"` })
      .send('﻿' + toCsv(rows.map(toCsvRow)));
    return;
  }
  res.json({ [key]: rows, total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)), limit: p.limit, sort: p.sortKey, dir: p.dir, ...extra });
}

/** Validates a bulk request: up to 200 ids and one action from the allowed list. */
export function bulkInput(body, actions) {
  return z.object({
    ids: z.array(z.uuid()).min(1, 'Select at least one row').max(200),
    action: z.enum(actions),
    reason: z.string().trim().max(500).optional(),
  }).parse(body);
}
