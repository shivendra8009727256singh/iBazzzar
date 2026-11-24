// End-to-end run: disposable database → API → production web build → Playwright specs in tests/e2e.
// Builds the web app first so the tests never run against a stale build (set E2E_SKIP_BUILD=1 to reuse the last one). Uses the installed Microsoft Edge (or Chrome) so no browser download is needed.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { freePort, startDatabase, startProcess, ROOT } from './stack.mjs';

if (process.env.E2E_SKIP_BUILD !== '1') {
  const build = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'build', 'apps/web'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const db = await startDatabase({ dir: resolve(ROOT, '.local', `e2e-${randomUUID()}`), port: await freePort(), persistent: false });
const apiPort = await freePort();
const webPort = await freePort();
const origin = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env, NODE_ENV: 'development', DATABASE_URL: db.url, DATABASE_CA_CERT_FILE: '', DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
  PORT: String(apiPort), HOST: '127.0.0.1', WEB_ORIGIN: origin, API_ORIGIN: `http://127.0.0.1:${apiPort}`, REDIS_URL: '',
  DEMO_PAYMENTS: 'true', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '', MAIL_PROVIDER: 'console',
  STORAGE_DRIVER: 'local', MEDIA_DIR: resolve(ROOT, '.local', 'e2e-uploads'), ADMIN_NAME: 'E2E Admin', ADMIN_EMAIL: 'e2e-admin@example.test', ADMIN_PASSWORD: 'Console-Keeper-Phrase-2026', LOG_LEVEL: 'info',
};
let api;
let web;
let status = 1;
try {
  // The Admin is created exactly as in production: by the script, from environment values.
  const made = spawnSync(process.execPath, ['scripts/create-admin.mjs'], { cwd: ROOT, env, encoding: 'utf8', windowsHide: true });
  if (made.status !== 0) throw new Error(made.stderr || made.stdout);
  api = await startProcess('API', ['apps/api/src/server.js'], env, 'IBazzzar API ready');
  web = await startProcess('Web', [resolve(ROOT, 'node_modules/next/dist/bin/next'), 'start', 'apps/web', '-H', '127.0.0.1', '-p', String(webPort)], env, 'Ready');
  const run = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'tests/e2e/playwright.config.js', ...process.argv.slice(2)], {
    cwd: ROOT, stdio: 'inherit', env: { ...env, E2E_BASE_URL: origin },
  });
  status = run.status ?? 1;
} catch (error) {
  console.error(error.message);
} finally {
  api?.child.kill();
  web?.child.kill();
  await db.stop();
}
process.exit(status);
