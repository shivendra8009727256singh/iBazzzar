// Starts a disposable or persistent local stack: embedded PostgreSQL (UTF-8), migrations, seed data, API and web.
// Used by `npm run dev:db` (database only) and `npm run test:e2e` (everything, then Playwright).
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

export function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer().once('error', fail).listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

export async function startDatabase({ dir, port, persistent, seedDemo = true }) {
  const fresh = !existsSync(resolve(dir, 'PG_VERSION'));
  await mkdir(dir, { recursive: true });
  const password = persistent ? 'ibazzzar_local_dev' : randomBytes(16).toString('hex');
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'ibazzzar', password, port, persistent, authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {},
    onError: (m) => { if (String(m).includes('FATAL')) console.error(String(m)); },
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('ibazzzar');
  const url = `postgresql://ibazzzar:${password}@127.0.0.1:${port}/ibazzzar`;
  const env = { ...process.env, DATABASE_URL: url };
  const migrate = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', 'apps/api/prisma.config.js'], { cwd: ROOT, env, encoding: 'utf8', windowsHide: true });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout);
  const seed = spawnSync(process.execPath, ['apps/api/prisma/seed.js', ...(seedDemo ? ['--demo'] : [])], { cwd: ROOT, env, encoding: 'utf8', windowsHide: true });
  if (seed.status !== 0) throw new Error(seed.stderr || seed.stdout);
  return { pg, url, async stop() { await pg.stop().catch(() => {}); if (!persistent) await rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}

export function startProcess(name, args, env, readyText) {
  return new Promise((resolveReady, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let log = '';
    const timer = setTimeout(() => reject(new Error(`${name} did not start in time:\n${log.slice(-2000)}`)), 90_000);
    const onData = (chunk) => {
      log += chunk;
      if (log.includes(readyText)) { clearTimeout(timer); resolveReady({ child, log: () => log }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`${name} exited with ${code}:\n${log.slice(-2000)}`)); });
  });
}
