import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function git(command: string): string | undefined {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
}

// The manifest's code_version (run-manifest.schema.json): the revision identifies the
// code a replay claim holds against; dirty means it does not identify it at all.
const revision = process.env.DROGNA_REVISION ?? git('git rev-parse --short HEAD') ?? 'unversioned';
const dirty = (git('git status --porcelain') ?? '') !== '';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so an instance serves from any path of the gh-pages estate
  // (NFR-04) as well as from the site root.
  base: './',
  define: {
    __DROGNA_REVISION__: JSON.stringify(revision),
    __DROGNA_DIRTY__: JSON.stringify(dirty),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // These tests turn the loop against the real backend — thousands of simulated
    // ticks, with the panels mounted in some of them — so vitest's default five
    // seconds measures the runner rather than the behaviour. It was set on four
    // describes one at a time, each time somebody hit the wall, and the fifth to hit
    // it went red in CI on a test that was not the one that ran out of time. One
    // budget here, and no test carries its own.
    testTimeout: 120_000,
  },
});
