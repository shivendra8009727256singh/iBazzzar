import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/setup/global-db.js'],
    testTimeout: 30000,
    hookTimeout: 120000,
    // Each file gets its own database, so files can run in parallel safely.
    fileParallelism: true,
    maxWorkers: 4,
  },
});
