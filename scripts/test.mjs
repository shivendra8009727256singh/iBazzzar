// Runs Vitest from a normalised working directory. On Windows, editors sometimes start shells in "c:\…" while Node
// resolves modules under "C:\…"; Vitest then loads two copies of itself and fails with "failed to find the runner".
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cwd = process.platform === 'win32' ? root.replace(/^[a-z]:/, (d) => d.toUpperCase()) : root;
const vitest = resolve(cwd, 'node_modules/vitest/vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run', ...process.argv.slice(2)], { cwd, stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
