// Regenerates docs/api/openapi.yaml from the live Express route table, so the document can't drift from the code.
// Usage: node scripts/openapi.mjs   (no database needed; the app is built with inert dependencies)
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../apps/api/src/app.js';

const app = createApp({
  prisma: {}, config: { origin: 'http://localhost', production: false, demoPayments: false, encryptionKey: '0'.repeat(64) },
  mailer: { configured: false, provider: 'none' }, storage: { driver: 'none' }, payments: { configured: false, mode: 'none' }, shipping: { live: false },
});

const routes = [];
for (const layer of app.router.stack) {
  if (!layer.route) continue;
  for (const method of Object.keys(layer.route.methods)) routes.push({ method, path: layer.route.path });
}
const group = (p) => (p.startsWith('/api/admin') ? 'Admin' : p.startsWith('/api/seller') ? 'Seller' : p.startsWith('/api/business') ? 'Business' : p.startsWith('/api/auth') ? 'Auth' : p.startsWith('/api/support') || p.startsWith('/api/notifications') ? 'Support' : p.startsWith('/api/orders') || p.startsWith('/api/checkout') || p.startsWith('/api/payments') || p.startsWith('/api/account') ? 'Orders & account' : p.startsWith('/api/cart') || p.startsWith('/api/wishlist') ? 'Cart' : 'Catalogue & content');
const byPath = new Map();
for (const r of routes) {
  const path = r.path.replace(/:(\w+)/g, '{$1}');
  const ops = byPath.get(path) ?? {};
  ops[r.method] = r;
  byPath.set(path, ops);
}
const lines = [
  'openapi: 3.1.0',
  'info:',
  '  title: IBazzzar API',
  '  version: 2.0.0',
  '  description: |',
  '    Generated from the Express route table by scripts/openapi.mjs. Money is integer paise. State-changing requests must',
  '    come from the web origin (Origin header) and authenticate with the HTTP-only ib_session cookie. Errors are',
  '    { error: string, fields?: { [path]: message } }.',
  'servers:',
  '  - url: https://ibazzzar.com',
  'paths:',
];
for (const [path, ops] of [...byPath].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`  ${path}:`);
  for (const method of Object.keys(ops).sort()) {
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    lines.push(`    ${method}:`, `      tags: [${JSON.stringify(group(path))}]`, `      operationId: ${method}${path.replace(/[^a-zA-Z0-9]+(\w)?/g, (_, c) => (c ? c.toUpperCase() : ''))}`);
    if (params.length) {
      lines.push('      parameters:');
      for (const p of params) lines.push(`        - { name: ${p}, in: path, required: true, schema: { type: string } }`);
    }
    lines.push('      responses:', "        '200': { description: OK }");
  }
}
await mkdir(resolve(import.meta.dirname, '../docs/api'), { recursive: true });
await writeFile(resolve(import.meta.dirname, '../docs/api/openapi.yaml'), lines.join('\n') + '\n');
console.log(`Wrote docs/api/openapi.yaml with ${routes.length} operations on ${byPath.size} paths.`);
