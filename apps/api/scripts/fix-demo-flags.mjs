// One-off correction: before 2026-11-25 every order placed in demo mode was flagged demo, even cash on delivery,
// bank transfer and credit terms, where no payment is simulated. This marks those orders (and their seller
// settlement rows) as real. Orders paid by simulated online payment stay demo.
// Usage: node --env-file=../../.env scripts/fix-demo-flags.mjs          (dry run: lists what would change)
//        node --env-file=../../.env scripts/fix-demo-flags.mjs --apply  (makes the change in one transaction)
import { createPrisma } from '../src/lib/db.js';

const apply = process.argv.includes('--apply');
const prisma = createPrisma({ databaseUrl: process.env.DATABASE_URL, poolSize: 2 });
const where = { demo: true, paymentMethod: { not: 'ONLINE' }, paymentStatus: { not: 'DEMO_SIMULATED' } };
const orders = await prisma.order.findMany({ where, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, paymentMethod: true, paymentStatus: true, status: true, totalPaise: true } });
const entries = orders.length ? await prisma.settlementEntry.count({ where: { orderId: { in: orders.map((o) => o.id) }, demo: true } }) : 0;
console.log(`${orders.length} non-online order(s) wrongly marked demo; ${entries} seller settlement row(s) to match:`);
for (const o of orders) console.log(`  ${o.number} | ${o.paymentMethod} | ${o.paymentStatus} | ${o.status} | ₹${Number(o.totalPaise) / 100}`);
if (apply && orders.length) {
  const ids = orders.map((o) => o.id);
  await prisma.$transaction([
    prisma.order.updateMany({ where: { id: { in: ids } }, data: { demo: false } }),
    prisma.settlementEntry.updateMany({ where: { orderId: { in: ids }, demo: true }, data: { demo: false } }),
  ]);
  console.log('Applied.');
} else if (orders.length) console.log('Dry run only. Add --apply to make the change.');
await prisma.$disconnect();
