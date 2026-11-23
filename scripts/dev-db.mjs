// Local development database (embedded PostgreSQL 18, persistent in .local/dev-db) with migrations and demo data.
// Use it when you want to run IBazzzar without a managed database:
//   npm run dev:db        → prints a DATABASE_URL; keep this window open
//   then put that URL in .env and run `npm run dev` in another window.
import { resolve } from 'node:path';
import { startDatabase, ROOT } from './stack.mjs';

const db = await startDatabase({ dir: resolve(ROOT, '.local/dev-db'), port: Number(process.env.DEV_DB_PORT) || 5544, persistent: true });
console.log('\nIBazzzar development database is running.');
console.log(`DATABASE_URL=${db.url}`);
console.log('Demo catalogue loaded (every demo record is flagged demo = true). Press Ctrl+C to stop.\n');
const stop = async () => { await db.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
