// Creates (or resets) the one Super Admin account from .env and makes sure no other account holds the Super Admin role.
//
//   SUPERADMIN_NAME=IBazzzar Super Admin
//   SUPERADMIN_EMAIL=admin@example.com
//   SUPERADMIN_PASSWORD=<at least 16 characters>
//
// Usage: npm run superadmin        (or: node scripts/create-superadmin.mjs)
// Safe to run again: it updates the password to the current .env value and unlocks the account.
// The Super Admin signs in at /superadmin/login. Registration and the admin console can never grant this role.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config.js';
import { createPrisma } from '../apps/api/src/lib/db.js';
import { hashPassword } from '../apps/api/src/lib/security.js';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const name = (process.env.SUPERADMIN_NAME || 'IBazzzar Super Admin').trim();
const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.SUPERADMIN_PASSWORD || '');

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Set SUPERADMIN_EMAIL in .env to a valid email address.');
if (password.length < 16) fail('Set SUPERADMIN_PASSWORD in .env to at least 16 characters.');
if (new Set(password).size < 8) fail('SUPERADMIN_PASSWORD is too easy to guess. Use a long random value.');
if (password.toLowerCase().includes(email.split('@')[0])) fail('SUPERADMIN_PASSWORD must not contain the email name.');

const prisma = createPrisma(loadConfig());
try {
  const passwordHash = await hashPassword(password);
  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    const created = !user;
    user = user
      ? await tx.user.update({ where: { id: user.id }, data: { name, passwordHash, status: 'ACTIVE', failedLogins: 0, lockedUntil: null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } })
      : await tx.user.create({ data: { name, email, passwordHash, emailVerifiedAt: new Date(), termsAcceptedAt: new Date() } });

    // Exactly one Super Admin: whoever else holds the role loses it and is signed out.
    const others = await tx.userRole.findMany({ where: { role: 'ADMIN', userId: { not: user.id } }, include: { user: { select: { email: true } } } });
    if (others.length) {
      await tx.userRole.deleteMany({ where: { role: 'ADMIN', userId: { in: others.map((o) => o.userId) } } });
      await tx.session.deleteMany({ where: { userId: { in: others.map((o) => o.userId) } } });
    }

    // The Super Admin holds only the ADMIN role and signs in fresh after any change.
    await tx.userRole.deleteMany({ where: { userId: user.id, role: { not: 'ADMIN' } } });
    await tx.userRole.upsert({ where: { userId_role: { userId: user.id, role: 'ADMIN' } }, create: { userId: user.id, role: 'ADMIN' }, update: {} });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: { actorId: 'cli', action: created ? 'superadmin.created' : 'superadmin.reset', entityType: 'user', entityId: user.id, metadata: { revokedFrom: others.map((o) => o.user.email) } },
    });
    return { created, revoked: others.map((o) => o.user.email) };
  });

  console.log(`\n✓ Super Admin ${result.created ? 'created' : 'updated'}: ${email}`);
  if (result.revoked.length) console.log(`  Super Admin role removed from: ${result.revoked.join(', ')}`);
  console.log('  Sign in at /superadmin/login with the email and password from .env.\n');
} finally {
  await prisma.$disconnect();
}
