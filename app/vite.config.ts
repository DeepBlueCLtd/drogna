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
    // Several tests build a whole backend, turn the loop until the model runner
    // genuinely publishes, and then drive a panel against what it published. Those are
    // integration tests wearing unit clothes, and they are the ones worth having: the
    // alternative is a fixture, which publishes nothing. As the suite grew they began
    // to lose the race against vitest's 5s default under parallel load — the spread
    // test at ~5.3s, and its file-neighbour failing behind it because a timed-out test
    // leaves its runtime ticking. The bound is raised rather than the tests trimmed.
    testTimeout: 20_000,
  },
});
