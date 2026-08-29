/**
 * Gate: the site is fit to publish.
 *
 * Three things have to be true of the built estate before it is pushed, and each is
 * here because it is the kind of thing that is true until a template changes and then
 * silently is not:
 *
 *   the statement   FR-01's sentence — synthetic data, deliberately fake numerics —
 *                   is on the landing page, and above the first section heading. A
 *                   reader who has scrolled past it has already formed an impression.
 *   noindex         every page declines indexing, and robots.txt says so too. The
 *                   repository is public but unadvertised (PR-01); a reader arriving
 *                   from a search engine arrives without the statement.
 *   .nojekyll       present, or GitHub Pages runs Jekyll over the estate and drops
 *                   anything beginning with an underscore.
 *   no stubs        no published page declares itself unwritten. V1 learned this one
 *                   the hard way: a page that says it is a stub is a stub whatever its
 *                   length, and five such pages were longer than the shortest page the
 *                   project had accepted as finished — so length cannot be the test and
 *                   the page's own admission has to be.
 */
import { join } from 'node:path';
import { buildSite, type SiteFile } from '../site/build.js';
import { REPO_ROOT, type Finding } from './lib.js';

const REQUIRED_OF_THE_STATEMENT = [/deliberately fake/i, /synthetic/i];
/** How a page admits it is unwritten, in the form the corpus spells it. */
const STUB = /\bStub\s*[—:-]/;

export function inspect(files: readonly SiteFile[]): Finding[] {
  const findings: Finding[] = [];
  const at = (path: string): SiteFile | undefined => files.find((file) => file.path === path);

  const landing = at('index.html');
  if (!landing) {
    findings.push({ file: 'index.html', line: 0, message: 'the site has no landing page' });
  } else {
    const text = String(landing.contents);
    const opening = text.slice(text.indexOf('<main'), indexOrEnd(text, '<h2'));
    for (const required of REQUIRED_OF_THE_STATEMENT) {
      if (!required.test(opening)) {
        findings.push({
          file: 'index.html',
          line: 0,
          message: `the landing page does not state ${required.source} above its first section heading (FR-01)`,
        });
      }
    }
  }

  for (const file of files) {
    if (!file.path.endsWith('.html')) continue;
    const text = String(file.contents);
    if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(text)) {
      findings.push({ file: file.path, line: 0, message: 'the page does not decline indexing (PR-01)' });
    }
    if (STUB.test(text)) {
      findings.push({ file: file.path, line: 0, message: 'the page declares itself a stub and is being published as a page' });
    }
  }

  const robots = at('robots.txt');
  if (!robots) findings.push({ file: 'robots.txt', line: 0, message: 'robots.txt is missing' });
  else if (!/Disallow:\s*\//i.test(String(robots.contents))) {
    findings.push({ file: 'robots.txt', line: 0, message: 'robots.txt does not disallow crawling' });
  }

  if (!at('.nojekyll')) {
    findings.push({ file: '.nojekyll', line: 0, message: '.nojekyll is missing; Pages would run Jekyll over the estate' });
  }
  return findings;
}

function indexOrEnd(text: string, needle: string): number {
  const found = text.indexOf(needle);
  return found === -1 ? text.length : found;
}

export function runGate(root: string = REPO_ROOT, contentDir?: string): Finding[] {
  return inspect(buildSite(root, contentDir ?? join(root, 'site', 'docs')).files);
}
