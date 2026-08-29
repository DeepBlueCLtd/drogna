/**
 * What is in the chunk the browser must have before anything runs.
 *
 *   node spikes/load-time/bundle.mjs
 *
 * It drives vite's own build rather than parsing the output, because rollup knows which
 * module contributed which bytes and no reader of the minified file does. Sizes are
 * `renderedLength`, which is per-module before minification, so they sum to about twice
 * the emitted chunk; read them against each other, not as bytes on the wire. The one
 * number that is bytes on the wire is the emitted total printed beside each chunk.
 *
 * vite is a dependency of the `app` workspace and not of the root, so it is resolved
 * from there rather than imported by bare name — this file lives outside `app/`.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const fromApp = createRequire(join(appDirectory, 'package.json'));
const load = (name) => import(pathToFileURL(fromApp.resolve(name)).href);

const { build } = await load('vite');
const react = (await load('@vitejs/plugin-react')).default;

function group(id) {
  const dependency = id.match(/node_modules\/(\.pnpm\/)?(@?[^/]+)/);
  if (dependency) return `npm:${dependency[2].replace(/[@+][\d.]+.*$/, '')}`;
  for (const area of ['generated', 'backend', 'panels', 'shell', 'seam']) {
    if (id.includes(`/src/${area}/`)) return `src/${area}`;
  }
  return 'other';
}

await build({
  root: appDirectory,
  logLevel: 'error',
  base: './',
  define: { __DROGNA_REVISION__: '"spike"', __DROGNA_DIRTY__: 'false' },
  plugins: [
    react(),
    {
      name: 'drogna-spike-sizes',
      generateBundle(_options, bundle) {
        for (const [name, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          const sizes = new Map();
          for (const [id, module] of Object.entries(chunk.modules)) {
            const key = group(id);
            sizes.set(key, (sizes.get(key) ?? 0) + module.renderedLength);
          }
          console.log(`\n== ${name}   emitted ${chunk.code.length} bytes`);
          for (const [key, size] of [...sizes].sort((a, b) => b[1] - a[1])) {
            if (size > 3000) console.log(`  ${String(size).padStart(9)}  ${key}`);
          }
        }
      },
    },
  ],
});
