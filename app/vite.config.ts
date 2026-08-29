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
    // (feature 112, FR-021). It is an entry rather than a copied asset because Vite has
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
  },
});
