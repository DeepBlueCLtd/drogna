/**
 * The page shell and the stylesheet. Both are strings in this module because both are
 * part of the publication contract the gates check: every page carries the noindex
 * declaration, every URL in a page is relative, and nothing is fetched from another
 * origin. A theme installed from a package could satisfy all three today and stop
 * tomorrow without anyone editing this repository — V1's site fetched Google Fonts by
 * default and had to be told not to.
 *
 * The palette is the shell's own (app/src/shell/shell.css). The site and the running
 * demo are one thing and should not look like two.
 */
import { escapeHtml } from './markdown.js';

export interface NavEntry {
  readonly title: string;
  readonly url: string;
  readonly children: readonly NavEntry[];
}

export interface PageShell {
  readonly title: string;
  readonly description: string;
  readonly bodyHtml: string;
  /** Depth of the page's directory below the site root, for relative asset URLs. */
  readonly depth: number;
  readonly nav: readonly NavEntry[];
  /** Site-root-relative URL of this page, so the nav can mark where the reader is. */
  readonly here: string;
}

function upTo(depth: number): string {
  return depth === 0 ? './' : '../'.repeat(depth);
}

function renderNav(entries: readonly NavEntry[], prefix: string, here: string): string {
  if (entries.length === 0) return '';
  const items = entries
    .map((entry) => {
      const current = entry.url === here;
      const href = `${prefix}${entry.url}`;
      const link = `<a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(entry.title)}</a>`;
      return `<li>${link}${renderNav(entry.children, prefix, here)}</li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

export function renderPage(shell: PageShell): string {
  const up = upTo(shell.depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- The site is public but unadvertised (SRD-v2 PR-01). It declines indexing here and
     in robots.txt, because a reader arriving from a search engine has arrived without
     the sentence that says the numbers are invented. -->
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${escapeHtml(shell.description)}">
<title>${escapeHtml(shell.title === 'drogna' ? shell.title : `${shell.title} — drogna`)}</title>
<link rel="stylesheet" href="${up}assets/theme.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="masthead">
  <a class="brand" href="${up}">drogna</a>
  <p class="caveat">A demonstration harness. Every number in it is invented.</p>
</header>
<div class="frame">
  <nav class="sidebar" aria-label="Site">
${renderNav(shell.nav, up, shell.here)}
  </nav>
  <main id="content" class="content">
${shell.bodyHtml}
  </main>
</div>
<footer class="footer">
  <p>drogna is a learning harness. Its data is synthetic and its numerics are deliberately
  fake. Nothing it produces is a measurement of anything real.</p>
  <p>This site loads nothing from another origin: no fonts, no scripts, no analytics.</p>
</footer>
</body>
</html>
`;
}

export const THEME_CSS = `/* The site's whole stylesheet. Nothing is fetched: the font stack is what the
   reader's machine already has, which is also why no @font-face appears here. */
:root {
  color-scheme: dark;
  --bg: #10151b;
  --panel: #161d25;
  --fg: #d5dde5;
  --dim: #8b96a3;
  --rule: #232c36;
  --accent: #4cc2ff;
  --lit: #58d68d;
  --warn: #ff7b6b;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}
.skip {
  position: absolute;
  left: -9999px;
}
.skip:focus {
  left: 0.5rem;
  top: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--panel);
  z-index: 2;
}
.masthead {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.7rem 1.5rem;
  border-bottom: 1px solid var(--rule);
}
.brand {
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: 1.1rem;
  color: var(--fg);
  text-decoration: none;
}
.caveat { margin: 0; color: var(--dim); font-size: 0.85rem; }
.frame {
  display: flex;
  align-items: flex-start;
  gap: 2rem;
  max-width: 66rem;
  margin: 0 auto;
  padding: 1.5rem;
}
.sidebar {
  flex: 0 0 15rem;
  position: sticky;
  top: 1.5rem;
  font-size: 0.9rem;
}
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar ul ul { padding-left: 0.9rem; }
.sidebar li { margin: 0.15rem 0; }
.sidebar a { color: var(--dim); text-decoration: none; display: block; padding: 0.1rem 0; }
.sidebar a:hover { color: var(--fg); }
.sidebar a[aria-current='page'] { color: var(--accent); }
.content { flex: 1 1 auto; min-width: 0; }
.content h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 1rem; }
.content h2 { font-size: 1.35rem; margin: 2rem 0 0.6rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.3rem; }
.content h3 { font-size: 1.1rem; margin: 1.5rem 0 0.4rem; }
.content a { color: var(--accent); }
.content img { max-width: 100%; height: auto; border: 1px solid var(--rule); }
.content hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }
.content blockquote {
  margin: 1rem 0;
  padding: 0.1rem 1rem;
  border-left: 3px solid var(--rule);
  color: var(--dim);
}
.content code {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.87em;
  background: var(--panel);
  padding: 0.05em 0.28em;
  border-radius: 3px;
}
.content pre {
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 0.8rem 1rem;
  overflow-x: auto;
}
.content pre code { background: none; padding: 0; }
.table-scroll, .content table { display: block; overflow-x: auto; }
.content table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
.content th, .content td { border: 1px solid var(--rule); padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
.content th { background: var(--panel); }
.admonition {
  margin: 1.2rem 0;
  padding: 0.1rem 1rem;
  border: 1px solid var(--rule);
  border-left: 3px solid var(--dim);
  border-radius: 4px;
  background: var(--panel);
}
.admonition-title { font-weight: 600; margin: 0.8rem 0 0.2rem; }
.admonition-warning { border-left-color: var(--warn); }
.admonition-warning .admonition-title { color: var(--warn); }
.admonition-success { border-left-color: var(--lit); }
.admonition-success .admonition-title { color: var(--lit); }
.admonition-note { border-left-color: var(--accent); }
.admonition-note .admonition-title { color: var(--accent); }
.footer {
  border-top: 1px solid var(--rule);
  padding: 1rem 1.5rem 2rem;
  color: var(--dim);
  font-size: 0.82rem;
}
.footer p { max-width: 60rem; margin: 0.3rem auto; }
@media (max-width: 52rem) {
  .frame { display: block; }
  .sidebar { position: static; margin-bottom: 1.5rem; }
}
`;
