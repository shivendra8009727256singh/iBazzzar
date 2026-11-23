// Prisma client factory. SSL settings come from config so managed databases (Aiven, RDS) work with their CA.
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export { Prisma };

export function createPrisma({ databaseUrl, databaseSsl, poolSize = 10 }) {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get('sslmode');
  // node-postgres treats sslmode in the URL as authoritative, so it is translated into an explicit ssl object instead.
  url.searchParams.delete('sslmode');
  const ssl = sslmode && sslmode !== 'disable'
    ? { rejectUnauthorized: databaseSsl?.rejectUnauthorized ?? true, ...(databaseSsl?.ca ? { ca: databaseSsl.ca } : {}) }
    : undefined;
  const adapter = new PrismaPg({ connectionString: url.toString(), ssl, max: poolSize });
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
