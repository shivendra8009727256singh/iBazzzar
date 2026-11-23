// Grants the Super Admin role to an existing account in the configured database.
// Usage: node scripts/grant-admin.mjs person@example.com
// Use this for the first production administrator; afterwards, Super Admins manage staff roles in the console.
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../apps/api/src/config.js';
import { createPrisma } from '../apps/api/src/lib/db.js';

loadEnv({ quiet: true });
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs <email>');
  process.exit(1);
}
const prisma = createPrisma(loadConfig());
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}. Register on the website first, then run this again.`);
    process.exitCode = 1;
  } else {
    await prisma.$transaction([
      prisma.userRole.upsert({ where: { userId_role: { userId: user.id, role: 'ADMIN' } }, create: { userId: user.id, role: 'ADMIN' }, update: {} }),
      prisma.auditLog.create({ data: { actorId: 'cli', action: 'user.roles-changed', entityType: 'user', entityId: user.id, metadata: { roles: ['ADMIN'], via: 'grant-admin script' } } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    console.log(`${email} is now a Super Admin. Sign in again to open the console.`);
  }
} finally {
  await prisma.$disconnect();
}
