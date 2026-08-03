import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Source only: `pnpm build` also emits the compiled specs into dist/, and
    // running both would double every test.
    include: ['src/**/*.test.ts'],
  },
});
