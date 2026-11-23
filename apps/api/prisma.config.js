// Prisma CLI config. Reads the project's root .env (where DATABASE_URL lives) whether the CLI runs from the repo root
// or from apps/api via `npm run db:migrate`. A variable already set in the environment always wins.
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: [resolve(import.meta.dirname, '../../.env'), resolve(import.meta.dirname, '.env')], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL || 'postgresql://ibazzzar:local_only@127.0.0.1:5433/ibazzzar_dev' },
});
