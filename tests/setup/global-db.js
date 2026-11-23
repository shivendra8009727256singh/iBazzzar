// Vitest global setup: one disposable PostgreSQL cluster per test run.
// Migrations are applied to a template database exactly as production would apply them, then every
// test file clones that template into its own database (see tests/setup/db.js). Nothing here can
// reach the developer's .env database: the URL is built from a random local port and password.
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer().once('error', fail).listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

function prisma(args, url) {
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), ...args, '--config', 'apps/api/prisma.config.js'],
    { cwd: root, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, DATABASE_URL: url } },
  );
  return result;
}

export default async function setup({ provide }) {
  const port = await freePort();
  const password = randomBytes(24).toString('hex');
  const folder = resolve(root, '.local', `test-cluster-${randomUUID()}`);
  await mkdir(folder, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: folder,
    user: 'ibazzzar_test',
    password,
    port,
    persistent: false,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=300', '-c', 'fsync=off', '-c', 'synchronous_commit=off'],
    onLog: () => {},
    onError: (message) => { if (String(message).includes('FATAL')) console.error(String(message)); },
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ibazzzar_template');

  const base = `postgresql://ibazzzar_test:${password}@127.0.0.1:${port}`;
  const templateUrl = `${base}/ibazzzar_template`;

  const deploy = prisma(['migrate', 'deploy'], templateUrl);
  if (deploy.status !== 0) throw new Error(`Migration failed:\n${deploy.stderr || deploy.stdout}`);

  // The checked-in migrations must produce exactly what schema.prisma describes.
  const drift = prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'apps/api/prisma/schema.prisma', '--script', '--exit-code'], templateUrl);
  if (drift.status === 2) throw new Error(`schema.prisma has changes without a migration:\n${drift.stdout}`);
  if (drift.status !== 0) throw new Error(`Drift check failed:\n${drift.stderr || drift.stdout}`);

  provide('databaseBaseUrl', base);

  return async () => {
    await pg.stop().catch(() => {});
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  };
}
