/**
 * Place the built site in the gh-pages estate, without disturbing the other tenant.
 *
 *   pnpm site:publish <estate-directory>
 *
 * The estate has two tenants and the boundary between them is the whole design
 * (SRD-v2 NFR-04, D18). The site owns the root. `instances/` is owned by the instances
 * workflow, one subtree per branch, and is never rebuilt: a review instance cannot wait
 * for a merge, and an instance is retained after its pull request completes, so an
 * estate that were rewritten wholesale at each publication would take with it exactly
 * the addresses the requirement exists to keep.
 *
 * So this writes a manifest of the paths the site published, and on the next
 * publication removes only those paths that the new build no longer produces. It will
 * not delete anything under another tenant's path even if a manifest claims it: a
 * manifest is data, and data in an estate that anything can push to is not a licence.
 *
 * The first publication finds no manifest, because V1's estate was written by a tool
 * that kept none. That case is the one-time migration: everything at the root that is
 * not another tenant is the V1 site, and it is replaced. Its content is not lost —
 * the V1 pages are archived within the new site.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildSite, ESTATE_PATHS, type SiteFile } from './site/build.js';

const MANIFEST = '.drogna-site-manifest.json';
/** Never removed, whatever a manifest says: the checkout's own metadata. */
const NEVER_TOUCH = ['.git'];

export function ownedByAnotherTenant(path: string): boolean {
  return ESTATE_PATHS.some((tenant) => path === tenant.replace(/\/$/, '') || path.startsWith(tenant));
}

/** The paths a previous publication claimed, or — with no manifest — the V1 estate. */
export function pathsToReap(estate: string): string[] {
  const manifestPath = join(estate, MANIFEST);
  if (existsSync(manifestPath)) {
    const recorded = JSON.parse(readFileSync(manifestPath, 'utf8')) as { paths?: string[] };
    return (recorded.paths ?? []).filter((path) => !ownedByAnotherTenant(path) && !NEVER_TOUCH.includes(path));
  }
  return readdirSync(estate)
    .filter((name) => !NEVER_TOUCH.includes(name) && !ownedByAnotherTenant(`${name}/`) && name !== MANIFEST)
    .flatMap((name) => {
      const full = join(estate, name);
      return statSync(full).isDirectory() ? [`${name}/`] : [name];
    });
}

/**
 * A reaped file can leave its directory behind. Git would not carry an empty directory,
 * but the next publication's no-manifest fallback reads the root's directory entries,
 * so an empty one left lying about is a path that looks like a tenant.
 */
export function pruneEmptyDirectories(estate: string): void {
  const visit = (dir: string): boolean => {
    if (NEVER_TOUCH.includes(dir.split(sep).pop() ?? '')) return false;
    let empty = true;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!visit(full)) empty = false;
      } else {
        empty = false;
      }
    }
    if (empty && dir !== estate) {
      rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return false;
  };
  visit(estate);
}

export function write(estate: string, files: readonly SiteFile[]): void {
  for (const file of files) {
    if (ownedByAnotherTenant(file.path)) {
      throw new Error(`the site build produced '${file.path}', which belongs to another tenant of the estate`);
    }
    const target = join(estate, file.path.split('/').join(sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents);
  }
  writeFileSync(
    join(estate, MANIFEST),
    `${JSON.stringify({ paths: files.map((file) => file.path).sort() }, null, 2)}\n`,
  );
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const estate = argv[2];
  if (!estate) {
    console.error('usage: publish-site <estate-directory>');
    process.exit(2);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { files, faults } = buildSite(repoRoot);
  if (faults.length > 0) {
    for (const fault of faults) console.error(`${fault.file}: ${fault.message}`);
    console.error(`${faults.length} link fault(s); the estate is untouched`);
    process.exit(1);
  }

  const reaped = pathsToReap(estate);
  for (const path of reaped) rmSync(join(estate, path.split('/').join(sep)), { recursive: true, force: true });
  pruneEmptyDirectories(estate);
  write(estate, files);
  console.log(`removed ${reaped.length} previously published path(s); wrote ${files.length} file(s) to ${estate}`);
}
