// Copies every row from one IBazzzar database to another with the same schema (e.g. local sample data → Aiven).
// The target's existing rows are replaced, all inside one transaction: if anything fails, the target is unchanged.
//
//   node scripts/copy-db.mjs <source DATABASE_URL> <target DATABASE_URL> --yes
//
// Both databases must be on the same migration. Migration history (_prisma_migrations) is never copied.
import pg from 'pg';
import { sslFromUrl } from '../apps/api/src/lib/db.js';

const [sourceUrl, targetUrl] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!sourceUrl || !targetUrl || !process.argv.includes('--yes')) {
  console.error('Usage: node scripts/copy-db.mjs <source DATABASE_URL> <target DATABASE_URL> --yes\nThe target database\'s rows are replaced.');
  process.exit(1);
}
const client = (u) => { const url = new URL(u); const ssl = sslFromUrl(url.searchParams.get('sslmode')); url.searchParams.delete('sslmode'); return new pg.Client({ connectionString: url.toString(), ssl }); };
const src = client(sourceUrl);
const dst = client(targetUrl);
await src.connect();
await dst.connect();
const host = (u) => new URL(u).host;

const migrations = async (c) => (await c.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows.map((r) => r.migration_name).join(',');
if (await migrations(src) !== await migrations(dst)) {
  console.error('The two databases are on different migrations. Run npm run db:migrate on both first.');
  process.exit(1);
}

// Tables in an order where every referenced table comes first.
const tables = (await src.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`)).rows.map((r) => r.tablename);
const deps = (await src.query(`SELECT conrelid::regclass::text AS t, confrelid::regclass::text AS ref FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)).rows;
const order = [];
const seen = new Set();
const visit = (t, path = new Set()) => {
  if (seen.has(t) || path.has(t)) return;
  path.add(t);
  for (const d of deps.filter((x) => x.t === t && x.ref !== t)) visit(d.ref.replace(/"/g, ''), path);
  seen.add(t);
  order.push(t);
};
for (const t of tables) visit(t);

const columns = async (t) => (await src.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t])).rows;
const selfRefs = new Map((await src.query(`SELECT conrelid::regclass::text AS t, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE contype = 'f' AND conrelid = confrelid`)).rows.map((r) => [r.t.replace(/"/g, ''), r.col]));

console.log(`Copying ${order.length} tables from ${host(sourceUrl)} to ${host(targetUrl)}…`);
let total = 0;
try {
  await dst.query('BEGIN');
  await dst.query(`TRUNCATE ${order.map((t) => `"${t}"`).join(', ')} CASCADE`);
  for (const t of order) {
    const cols = await columns(t);
    // Rows that point at another row of the same table (category parents) go after the rows they point at.
    const self = selfRefs.get(t);
    const { rows } = await src.query(`SELECT * FROM "${t}"${self ? ` ORDER BY "${self}" IS NOT NULL, "${self}"` : ''}`);
    if (!rows.length) continue;
    const names = cols.map((c) => `"${c.column_name}"`).join(', ');
    const json = new Set(cols.filter((c) => c.data_type === 'json' || c.data_type === 'jsonb').map((c) => c.column_name));
    const per = Math.max(1, Math.floor(30000 / cols.length));
    for (let i = 0; i < rows.length; i += per) {
      const batch = rows.slice(i, i + per);
      const values = [];
      const tuples = batch.map((r) => `(${cols.map((c) => { const v = r[c.column_name]; values.push(v !== null && json.has(c.column_name) ? JSON.stringify(v) : v); return `$${values.length}`; }).join(', ')})`);
      await dst.query(`INSERT INTO "${t}" (${names}) VALUES ${tuples.join(', ')}`, values);
    }
    total += rows.length;
    console.log(`  ${t}: ${rows.length}`);
  }
  await dst.query('COMMIT');
  console.log(`Done: ${total} rows copied.`);
} catch (error) {
  await dst.query('ROLLBACK').catch(() => {});
  console.error(`Copy failed, nothing was changed on the target: ${error.message}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
