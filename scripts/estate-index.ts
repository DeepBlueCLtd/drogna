/**
 * Write `instances/index.html` in the gh-pages estate: the address of every instance
 * the estate holds, which is what makes the review instances a *place* rather than a
 * set of URLs somebody has to already know (SRD-v2 NFR-04, D16).
 *
 *   pnpm estate:index <estate-directory>
 *
 * The listing is read from the estate, not from the repository. Instances outlive the
 * branches they were built from — that is the point of retaining them once a pull
 * request completes — so a list derived from today's branches would drop exactly the
 * instances the requirement exists to keep addressable.
 *
 * Each deployment writes an `instance.json` beside its build recording the ref and the
 * commit. Instances published before that file existed have none, and are listed
 * saying so rather than left out or given a plausible-looking blank.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { escapeHtml } from './site/markdown.js';
import { renderPage } from './site/theme.js';

interface Instance {
  readonly slug: string;
  readonly ref?: string;
  readonly sha?: string;
  readonly built?: string;
}

export function readInstances(estate: string): Instance[] {
  const root = join(estate, 'instances');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort()
    .map((slug) => {
      const provenance = join(root, slug, 'instance.json');
      if (!existsSync(provenance)) return { slug };
      try {
        return { slug, ...(JSON.parse(readFileSync(provenance, 'utf8')) as Omit<Instance, 'slug'>) };
      } catch {
        return { slug };
      }
    });
}

export function renderInstanceIndex(instances: readonly Instance[]): string {
  const rows = instances
    .map((instance) => {
      const name = escapeHtml(instance.slug);
      const ref = instance.ref ? `<code>${escapeHtml(instance.ref)}</code>` : '<em>not recorded</em>';
      const sha = instance.sha ? `<code>${escapeHtml(instance.sha.slice(0, 8))}</code>` : '<em>not recorded</em>';
      const built = instance.built ? escapeHtml(instance.built.slice(0, 10)) : '<em>not recorded</em>';
      return `<tr><td><a href="${name}/">${name}</a></td><td>${ref}</td><td>${sha}</td><td>${built}</td></tr>`;
    })
    .join('\n');

  const table =
    instances.length === 0
      ? '<p>The estate holds no instances yet.</p>'
      : `<table>
<thead><tr><th>Instance</th><th>Branch</th><th>Commit</th><th>Published</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;

  return renderPage({
    title: 'The instances',
    description: 'Every build of drogna the estate holds, one per branch, retained after its pull request completes.',
    depth: 1,
    here: 'instances/',
    nav: [
      { title: 'Home', url: '', children: [] },
      { title: 'The demo', url: 'demo/', children: [] },
    ],
    bodyHtml: `<h1 id="the-instances">The instances</h1>
<p>Every branch CI builds is published here as its own instance, and kept after its pull
request completes. A review comment can therefore link a specific build at a specific
view, and the link still resolves long afterwards.</p>
<p>Append <code>#/view/&lt;id&gt;</code> to any of these to open the shell at a named view —
<code>intro</code>, <code>system</code>, <code>holdings</code>, <code>map</code>,
<code>messages</code> or <code>operator</code>. <a href="../demo/">The demo page</a>
explains the addressing.</p>
${table}
<p><strong>Every instance is a demonstration harness with deliberately fake numerics and
synthetic data.</strong> Older instances are older software: an instance is a record of
what the branch did on the day it was built, not a supported build.</p>
<p>This page is regenerated from what the estate actually holds, every time anything is
published into it. An instance that is here is listed; an instance that is listed is
here.</p>`,
  });
}

// Imported by scripts/tests/estate.test.ts for the two functions above; run as a
// program by both publishing workflows. The guard is what lets it be both.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const estate = argv[2];
  if (!estate) {
    console.error('usage: estate-index <estate-directory>');
    process.exit(2);
  }
  const instances = readInstances(estate);
  // An estate with nothing published into it yet still gets the page, saying so.
  mkdirSync(join(estate, 'instances'), { recursive: true });
  writeFileSync(join(estate, 'instances', 'index.html'), renderInstanceIndex(instances));
  console.log(`instances/index.html lists ${instances.length} instance(s)`);
}
