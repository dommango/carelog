import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These are integration tests against a real database and each file
    // TRUNCATEs it on setup, so running files in parallel means they wipe each
    // other's fixtures mid-assertion. apps/web/vitest.config.ts does the same.
    fileParallelism: false,
    envFile: '.env',
  },
});
