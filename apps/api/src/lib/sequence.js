import { financialYear } from '../../../../packages/shared/src/index.js';

/**
 * Next value of a named counter. The UPSERT takes a row lock, so concurrent callers always get distinct numbers.
 * Example: nextNumber(tx, 'order', 'IBZ') → "IBZ-2026-27-000042".
 */
export async function nextNumber(tx, key, prefix, { width = 6 } = {}) {
  const fy = financialYear();
  const scoped = `${key}:${fy}`;
  const [row] = await tx.$queryRaw`
    INSERT INTO document_sequences (key, value) VALUES (${scoped}, 1)
    ON CONFLICT (key) DO UPDATE SET value = document_sequences.value + 1
    RETURNING value`;
  return `${prefix}-${fy}-${String(row.value).padStart(width, '0')}`;
}

/** Per-store GST invoice number for the current financial year, e.g. "INV/2026-27/00017". */
export async function nextInvoiceNumber(tx, storeId) {
  const fy = financialYear();
  const [row] = await tx.$queryRaw`
    INSERT INTO invoice_sequences ("storeId", "financialYear", next) VALUES (${storeId}::uuid, ${fy}, 2)
    ON CONFLICT ("storeId", "financialYear") DO UPDATE SET next = invoice_sequences.next + 1
    RETURNING next - 1 AS value`;
  return { number: `INV/${fy}/${String(row.value).padStart(5, '0')}`, financialYear: fy };
}
