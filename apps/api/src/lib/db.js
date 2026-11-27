// Prisma client factory. TLS follows the sslmode in DATABASE_URL, with the same meaning as psql and other PostgreSQL tools.
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export { Prisma };

/**
 * sslmode in the URL:
 *   (none) or disable          → no TLS (a database on the same machine or private network)
 *   require / prefer / allow   → encrypted; the server certificate isn't checked (what Aiven, Render, Railway hand out)
 *   verify-ca / verify-full    → encrypted and the certificate must be trusted by this machine
 */
export function sslFromUrl(sslmode) {
  if (!sslmode || sslmode === 'disable') return undefined;
  if (sslmode === 'verify-ca' || sslmode === 'verify-full') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

export function createPrisma({ databaseUrl, poolSize = 10 }) {
  const url = new URL(databaseUrl);
  // node-postgres would read sslmode itself with different meanings, so it is translated into an explicit ssl object.
  const ssl = sslFromUrl(url.searchParams.get('sslmode'));
  url.searchParams.delete('sslmode');
  // Every connection works in UTC, whatever the server's own setting. The driver sends dates without an offset, so on
  // a server set to e.g. Asia/Kolkata they would be stored 5½ hours off and disagree with the database's now().
  const adapter = new PrismaPg({ connectionString: url.toString(), ssl, max: poolSize, options: '-c TimeZone=UTC' });
  return new PrismaClient({ adapter });
}

/**
 * Runs fn inside a transaction. Callers lock the specific rows they change with SELECT … FOR UPDATE,
 * so unrelated checkouts run in parallel instead of queueing behind one global lock.
 */
export function transaction(prisma, fn, { timeout = 15000 } = {}) {
  return prisma.$transaction(fn, { timeout, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

/** Converts Prisma Decimal values to plain integer paise. */
export function toPaise(value) {
  if (value == null) return value;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Money value out of range: ${value}`);
  return n;
}
