// One command for local development: `npm run dev`.
//  1. Database: if DATABASE_URL points at this machine and nothing is listening there, starts the embedded
//     PostgreSQL in .local/dev-db (same data every time). Pending migrations are applied to the local database.
//     A remote database (e.g. Aiven) is used as-is and never migrated automatically.
//  2. Starts the API (restarts on file changes) and the web app, with labelled output.
//  3. Ctrl+C stops everything it started, including the database, cleanly.
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { startDatabase, ROOT } from './stack.mjs';

loadEnv({ path: resolve(ROOT, '.env'), quiet: true });
const COLORS = { DB: '\x1b[35m', API: '\x1b[36m', WEB: '\x1b[32m', DEV: '\x1b[33m' };
const say = (tag, line) => process.stdout.write(`${COLORS[tag]}[${tag}]\x1b[0m ${line}\n`);
const listening = (port, host = '127.0.0.1') => new Promise((done) => {
  const s = connect({ port, host }).once('connect', () => { s.destroy(); done(true); }).once('error', () => done(false));
  s.setTimeout(800, () => { s.destroy(); done(false); });
});

const children = [];
let db = null;
let stopping = false;

/** Kills a process and everything it started (on Windows `next dev` runs its server in a child process). */
function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say('DEV', 'Stopping…');
  for (const c of children) killTree(c);
  if (db) { await db.stop(); say('DB', 'Database stopped.'); }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function run(tag, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  children.push(child);
  let buffer = '';
  const onData = (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) say(tag, line);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => { if (!stopping) { say(tag, `exited with code ${code}. Stopping the rest.`); shutdown(code || 1); } });
  return child;
}

// ───────────── 1. Database ─────────────
const url = (() => { try { return new URL(process.env.DATABASE_URL); } catch { return null; } })();
if (!url) {
  say('DEV', 'DATABASE_URL in .env is missing or not a valid URL. Example: DATABASE_URL=postgresql://ibazzzar:ibazzzar_local_dev@127.0.0.1:5544/ibazzzar');
  process.exit(1);
}
const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
if (local) {
  const port = Number(url.port) || 5432;
  if (await listening(port)) {
    say('DB', `Using the database already running on port ${port}.`);
  } else {
    say('DB', `Starting the local database on port ${port} (data in .local/dev-db)…`);
    try {
      db = await startDatabase({ dir: resolve(ROOT, '.local/dev-db'), port, persistent: true, seedDemo: false });
    } catch (e) {
      say('DB', `Couldn't start the database: ${e.message}`);
      process.exit(1);
    }
    say('DB', 'Ready.');
  }
  // Keep the local schema current. Remote databases are migrated deliberately with `npm run db:migrate`.
  const migrate = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', 'apps/api/prisma.config.js'], { cwd: ROOT, env: process.env, encoding: 'utf8', windowsHide: true });
  if (migrate.status !== 0) { say('DB', `Migrations failed:\n${(migrate.stderr || migrate.stdout).trim()}`); await shutdown(1); }
  const applied = (migrate.stdout.match(/Applying migration `[^`]+`/g) ?? []).length;
  say('DB', applied ? `Applied ${applied} new migration(s).` : 'Schema is up to date.');
} else {
  say('DB', `Using the remote database at ${url.hostname}. Migrations are not run automatically; use npm run db:migrate when you mean to.`);
}

// ───────────── 2. API and web ─────────────
const apiPort = Number(process.env.PORT) || 4000;
for (const [name, port] of [['API', apiPort], ['website', 3000]]) {
  if (await listening(port)) {
    say('DEV', `Port ${port} (${name}) is already in use, probably by an earlier dev server. Close that window, or find it with:  netstat -ano | findstr :${port}`);
    await shutdown(1);
  }
}
run('API', ['--watch', 'src/server.js'], resolve(ROOT, 'apps/api'));
run('WEB', [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3000'], resolve(ROOT, 'apps/web'));
say('DEV', 'Website: http://127.0.0.1:3000   Admin: http://127.0.0.1:3000/admin/login   API: http://127.0.0.1:' + apiPort + '/api/health');
say('DEV', 'Press Ctrl+C to stop everything.');
