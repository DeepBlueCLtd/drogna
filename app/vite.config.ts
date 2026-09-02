import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  build: {
    // Two pages, one application. `mobile.html` frames the built shell at a phone's
    // viewport size so the narrow presentation can be reviewed from a desktop browser
    // (feature 113, FR-021). It is an entry rather than a copied asset because Vite has
    // to rewrite its relative reference to index.html for the published estate.
    rollupOptions: {
      input: {
        main: resolve(dirname(fileURLToPath(import.meta.url)), 'index.html'),
        mobile: resolve(dirname(fileURLToPath(import.meta.url)), 'mobile.html'),
      },
    },
  },
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
    //
    // Raised again at feature 115, for the same reason and with the same choice made
    // the same way. The analysis put another component in the loop and three more
    // holdings on every run, each digested over its own bytes, so every scenario test
    // turning the loop got dearer; the end-to-end analysis test then ran past 20s on a
    // CI runner under parallel load while taking half that here. Trimming the scenario
    // would have meant a configuration authored to make a test finish, and the thing
    // these tests are for is the loop as it ships.
    testTimeout: 60_000,
    // Two files now turn the loop once in a hook and share it across their assertions,
    // which is what stops five drives being paid for where one would do. The hook then
    // carries the cost the tests used to, and vitest budgets hooks separately — at ten
    // seconds by default, which is under what one drive costs even here.
    //
    // Raised again at feature 123, for the third time and by the same argument, because
    // that feature made the drive dearer in *simulation* time and the budget is in host
    // time. A run now occupies the ticks it costs, and the scheduler holds a warranted run
    // while the standing forecast still outlives it — so the second cycle no longer arrives
    // on the cadence floor. Measured, driving to the second publication:
    //
    //     shipped release_margin_ticks: 30   4429 ticks   38.7s standalone
    //     margin raised so no hold fires     3609 ticks   28.0s standalone
    //
    // — 23% more ticks and 38% more host time, in a hook that was already the longest in
    // the suite. It walked into this ceiling one commit at a time: 52.8s, 57.5s, 59.96s,
    // and then a timeout, the third of those passing by 36 milliseconds. A bound a run
    // clears by 0.06% is not a bound, and the run that cleared it was on this machine —
    // the comment above records CI taking roughly twice as long. 120s is that measurement
    // doubled for a CI runner and rounded up, and it is the number to re-derive the next
    // time the loop gets dearer rather than the number to nudge.
    hookTimeout: 120_000,
  },
});
