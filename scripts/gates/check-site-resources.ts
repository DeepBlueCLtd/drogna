/**
 * Gate: the published site fetches nothing from another origin (SRD-v2 PR-01).
 *
 * No font, no script, no stylesheet, no image, no analytics, no tracking of any kind.
 * A reader of this site makes exactly one request to exactly one host. Hyperlinks to
 * standards documents are fine and deliberately excluded: a link is a thing the reader
 * chooses to follow, and the rule is about what the page fetches on their behalf.
 *
 * The check reads the built output rather than the markdown, because the fault this
 * exists to catch is a theme or a generator quietly adding a request nobody wrote —
 * which is what V1's theme did, fetching Google Fonts until it was told not to.
 */
import { join } from 'node:path';
import { buildSite, type SiteFile } from '../site/build.js';
import { REPO_ROOT, type Finding } from './lib.js';

/** Attributes whose value the browser fetches, as opposed to `href` on an anchor. */
const FETCHING_ATTRIBUTE = /<(?!a\b)[a-z]+[^>]*?\s(?:src|href|srcset|poster|data)="([^"]+)"/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi;
const ANOTHER_ORIGIN = /^(?:https?:)?\/\//i;

export function inspect(files: readonly SiteFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!/\.(html|css)$/.test(file.path)) continue;
    const text = String(file.contents);
    const patterns = file.path.endsWith('.css') ? [CSS_URL, CSS_IMPORT] : [FETCHING_ATTRIBUTE, CSS_URL, CSS_IMPORT];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (!ANOTHER_ORIGIN.test(match[1])) continue;
        findings.push({
          file: file.path,
          line: text.slice(0, match.index).split('\n').length,
          message: `the page fetches '${match[1]}' from another origin (SRD-v2 PR-01)`,
        });
      }
    }
  }
  return findings;
}

export function runGate(root: string = REPO_ROOT, contentDir?: string): Finding[] {
  return inspect(buildSite(root, contentDir ?? join(root, 'site', 'docs')).files);
}
