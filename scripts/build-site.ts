/**
 * Write the site to disk. The build itself is scripts/site/build.ts, which produces
 * the estate in memory; this is the thin part that puts it somewhere, and the only
 * part the publishing workflow needs.
 *
 *   pnpm site:build            → site/build/
 *   pnpm site:build <dir>      → <dir>
 *
 * A build with link faults exits nonzero and writes nothing: an estate is grown
 * additively (SRD-v2 NFR-04), so a broken page pushed into it stays broken until
 * somebody notices, and nobody is watching. The same faults are reported by
 * scripts/gates/check-site-links.ts, which is what makes them visible before a push.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './site/build.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] ?? join(repoRoot, 'site', 'build'));

const { files, faults } = buildSite(repoRoot);

if (faults.length > 0) {
  for (const fault of faults) console.error(`${fault.file}: ${fault.message}`);
  console.error(`${faults.length} link fault(s); nothing written`);
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
for (const file of files) {
  const target = join(destination, file.path.split('/').join(sep));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.contents);
}
console.log(`${files.length} file(s) written to ${destination}`);
