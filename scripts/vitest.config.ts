import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/tests/**/*.test.ts'],
    // The runner test shells out through pnpm; give it room.
    testTimeout: 30_000,
  },
});
