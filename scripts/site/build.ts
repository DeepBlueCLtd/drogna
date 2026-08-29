/**
 * The site build. `buildSite` renders the whole estate page into memory and returns
 * it; `scripts/build-site.ts` writes that to disk and the site gates inspect it
 * without writing anything at all.
 *
 * That shape is deliberate. V1's publication gates ran over a directory that a
 * previous step had produced, which meant they could only run after a build, which
 * meant they ran in the workflow and nowhere else — and when the workflow was deleted
 * in the V2 retirement they stopped running without anything going red. A gate that
 * builds what it checks cannot be left behind by a workflow.
 *
 * Two rules the tree enforces rather than checks:
 *   - Navigation is derived from the directory tree, so a page cannot be missing from
 *     it. V1 kept the navigation in mkdocs.yml and had `--strict` fail the build when
 *     a page was left out; deriving it removes the fault instead of detecting it.
 *   - Every URL a page emits is relative, computed from where the page will sit, so
 *     the estate serves correctly under any base path — which it must, because it is
 *     published under /drogna/ and read from a temporary directory in the gates.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import {
  blogCoverageTable,
  componentTable,
  decisionIndexTable,
  entryList,
  readDecisionRecords,
  readEntry,
  readTopology,
  topicTable,
  type Entry,
} from './generated.js';
import { firstHeading, renderMarkdown, splitFrontMatter, type FrontMatter } from './markdown.js';
import { renderPage, THEME_CSS, type NavEntry } from './theme.js';

export interface SiteFile {
  /** Site-root-relative output path, e.g. `glossary/index.html`. */
  readonly path: string;
  readonly contents: string | Buffer;
}

export interface BuildFault {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface SiteBuild {
  readonly files: readonly SiteFile[];
  /** Link and anchor faults. A build with faults is still returned, so a gate can report them all. */
  readonly faults: readonly BuildFault[];
}

interface SourcePage {
  /** Site-root-relative markdown path the links in this page are written against. */
  readonly docPath: string;
  /** Repo-relative path of the file this came from, for fault messages. */
  readonly origin: string;
  readonly markdown: string;
}

interface Page extends SourcePage {
  readonly url: string;
  readonly title: string;
  readonly frontMatter: FrontMatter;
  readonly body: string;
}

const CONTENT_ROOT = join('site', 'docs');

function walkFiles(dir: string, base: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walkFiles(full, base));
    else found.push(relative(base, full).split(sep).join('/'));
  }
  return found;
}

/** `index.md` → the directory itself; anything else → a directory of its own name. */
export function urlOf(docPath: string): string {
  const withoutExtension = docPath.replace(/\.md$/, '');
  if (withoutExtension === 'index') return '';
  if (withoutExtension.endsWith('/index')) return `${withoutExtension.slice(0, -'/index'.length)}/`;
  return `${withoutExtension}/`;
}

function outputPathOf(url: string): string {
  return `${url}index.html`;
}

function depthOf(url: string): number {
  return url === '' ? 0 : url.split('/').filter((part) => part !== '').length;
}

/** A relative URL from a page that sits at `fromUrl` to something at `to`. */
export function relativeUrl(fromUrl: string, to: string): string {
  const from = fromUrl === '' ? '.' : fromUrl;
  const result = posix.relative(from, to);
  if (result === '') return './';
  return to.endsWith('/') && !result.endsWith('/') ? `${result}/` : result;
}

function collectSources(root: string, contentDir: string): { pages: SourcePage[]; assets: SiteFile[] } {
  const entries = walkFiles(contentDir, contentDir);
  const pages: SourcePage[] = [];
  const assets: SiteFile[] = [];
  for (const entry of entries) {
    const full = join(contentDir, entry.split('/').join(sep));
    if (entry.endsWith('.md')) {
      pages.push({ docPath: entry, origin: `${relative(root, contentDir).split(sep).join('/')}/${entry}`, markdown: readFileSync(full, 'utf8') });
    } else if (!entry.endsWith('.gitkeep')) {
      assets.push({ path: entry, contents: readFileSync(full) });
    }
  }

  // The decision records join the corpus as if they lived at decisions/adr/<slug>.md.
  // They do not: they live in docs/adr/, and are read from there. Presenting them at
  // that path is what lets a record's link to a sibling record — written as a bare
  // filename, in the repository, for a reader of the repository — resolve on the site
  // without either copy being edited.
  for (const record of readDecisionRecords(root)) {
    pages.push({
      docPath: `decisions/adr/${record.slug}.md`,
      origin: `docs/adr/${record.file}`,
      markdown: record.markdown,
    });
  }
  return { pages, assets };
}

function titleOf(frontMatter: FrontMatter, body: string, docPath: string): string {
  return frontMatter.title ?? firstHeading(body) ?? docPath;
}

/**
 * The `<!-- generated: ... -->` markers. A marker names a table the tree already
 * knows how to produce; nothing here writes back into site/docs/, so there is never a
 * committed copy to drift from its source.
 */
function expandGenerated(root: string, docPath: string, body: string, pages: readonly Page[]): string {
  if (!body.includes('<!-- generated:')) return body;
  const topology = readTopology(root);
  const entriesUnder = (): Entry[] => {
    const prefix = `${docPath.replace(/[^/]*$/, '')}posts/`;
    return pages
      .filter((page) => page.docPath.startsWith(prefix))
      .map((page) => readEntry(`posts/${page.docPath.slice(prefix.length)}`, page.markdown));
  };
  return body.replace(/<!--\s*generated:\s*([a-z0-9 -]+?)\s*-->/g, (whole, kind: string) => {
    switch (kind) {
      case 'component table':
        return componentTable(topology);
      case 'topic table':
        return topicTable(topology);
      case 'decision index':
        return decisionIndexTable(readDecisionRecords(root));
      case 'entry list':
        return entryList(entriesUnder());
      case 'blog coverage 1nn':
        return blogCoverageTable(root, entriesUnder(), /^1\d\d-/);
      case 'blog coverage 0nn':
        return blogCoverageTable(root, entriesUnder(), /^0\d\d-/);
      default:
        return whole;
    }
  });
}

/**
 * Nav order: every top-level page and section in one list, ordered by its
 * front-matter `order` and then by title. A section index carrying `collapse: true`
 * keeps its children out of the sidebar — the blog, the decision records and the
 * archive are reached from their own index pages, because a sidebar listing every
 * entry is a sidebar nobody reads.
 */
function buildNav(pages: readonly Page[]): NavEntry[] {
  const order = (page: Page): number => page.frontMatter.order ?? 100;
  const byOrder = (a: Page, b: Page): number => order(a) - order(b) || a.title.localeCompare(b.title);

  const home = pages.find((page) => page.docPath === 'index.md');
  const top = pages
    .filter((page) => page.docPath !== 'index.md')
    .filter((page) => {
      const parts = page.docPath.split('/');
      return parts.length === 1 || (parts.length === 2 && parts[1] === 'index.md');
    })
    .sort(byOrder);

  const entries: NavEntry[] = [];
  if (home) entries.push({ title: 'Home', url: '', children: [] });
  for (const page of top) {
    const isSection = page.docPath.endsWith('/index.md');
    const collapsed = (page.frontMatter as { collapse?: boolean }).collapse === true;
    let children: NavEntry[] = [];
    if (isSection && !collapsed) {
      const prefix = page.docPath.replace(/index\.md$/, '');
      children = pages
        .filter(
          (candidate) =>
            candidate.docPath.startsWith(prefix) &&
            candidate.docPath !== page.docPath &&
            candidate.docPath.slice(prefix.length).split('/').length === 1,
        )
        .sort(byOrder)
        .map((candidate) => ({ title: candidate.title, url: candidate.url, children: [] }));
    }
    entries.push({ title: page.title, url: page.url, children });
  }
  return entries;
}

/**
 * Paths the estate carries that this build does not produce. `instances/` is written
 * by .github/workflows/instances.yml — one subtree per branch, plus an index
 * regenerated from what the estate actually holds — so the site build cannot know its
 * contents and must not pretend to. A link to one is still checked, in the only way it
 * can be: the list is short, it is named here, and scripts/tests/site.test.ts reads the
 * workflow and asserts it really does write every path on it.
 */
export const ESTATE_PATHS: readonly string[] = ['instances/'];

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function rewriteLinks(
  page: Page,
  html: string,
  byUrl: Map<string, Page>,
  byDocPath: Map<string, Page>,
  slugsByUrl: Map<string, readonly string[]>,
  assetPaths: ReadonlySet<string>,
  faults: BuildFault[],
): string {
  return html.replace(/(\s(?:href|src)=")([^"]*)(")/g, (whole, open: string, target: string, close: string) => {
    if (target === '' || target.startsWith('#')) return whole;
    if (EXTERNAL.test(target)) {
      if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) return whole;
      faults.push({ file: page.origin, line: 0, message: `unsupported link scheme: ${target}` });
      return whole;
    }
    if (target.startsWith('/')) {
      faults.push({
        file: page.origin,
        line: 0,
        message: `absolute link '${target}': the estate is served under a base path, so every internal link must be relative`,
      });
      return whole;
    }
    const [pathPart, anchor] = splitAnchor(target);
    const resolved = posix.normalize(posix.join(posix.dirname(page.docPath), pathPart));

    if (pathPart.endsWith('.md')) {
      const destination = byDocPath.get(resolved);
      if (!destination) {
        faults.push({ file: page.origin, line: 0, message: `link to a page that does not exist: ${target}` });
        return whole;
      }
      if (anchor) {
        const slugs = slugsByUrl.get(destination.url) ?? [];
        if (!slugs.includes(anchor)) {
          faults.push({ file: page.origin, line: 0, message: `link to a heading that does not exist: ${target}` });
        }
      }
      const href = relativeUrl(page.url, destination.url) + (anchor ? `#${anchor}` : '');
      return `${open}${href}${close}`;
    }

    if (pathPart === '' && anchor) return whole;
    const asDirectory = resolved.endsWith('/') ? resolved : `${resolved}/`;
    if (ESTATE_PATHS.some((path) => asDirectory === path || asDirectory.startsWith(path))) {
      return `${open}${relativeUrl(page.url, asDirectory)}${anchor ? `#${anchor}` : ''}${close}`;
    }
    if (!assetPaths.has(resolved) && !byUrl.has(`${resolved}/`)) {
      faults.push({ file: page.origin, line: 0, message: `link to a file that is not published: ${target}` });
      return whole;
    }
    return `${open}${relativeUrl(page.url, resolved)}${anchor ? `#${anchor}` : ''}${close}`;
  });
}

function splitAnchor(target: string): [string, string | null] {
  const hash = target.indexOf('#');
  return hash === -1 ? [target, null] : [target.slice(0, hash), target.slice(hash + 1)];
}

/**
 * Every archived page says what it is, at the top, without anyone having to remember to
 * write it there. V1 published eighteen component pages carrying a notice that no code
 * existed, and the notice stayed long after it stopped being true — a banner a human
 * maintains is a banner that ends up lying. This one is a property of where the page
 * sits: move a page into archive/ and it gains the banner; move it out and it loses it.
 */
function archiveBanner(depth: number): string {
  const up = '../'.repeat(depth);
  return (
    '<div class="admonition admonition-warning">' +
    '<p class="admonition-title">Version 1 record</p>' +
    '<p>This page describes software that has been retired. It is accurate about ' +
    'Version 1 and is not a description of what runs now — see ' +
    `<a href="${up}">the current site</a> and <a href="${up}archive/">the archive</a>.</p>` +
    '</div>'
  );
}

/**
 * `contentDir` exists for the gates' own tests: pointed at a fixture tree, the build
 * runs exactly as it does over site/docs, which is what lets a planted broken link be
 * watched being caught rather than asserted about in the abstract.
 */
export function buildSite(root: string, contentDir: string = join(root, CONTENT_ROOT)): SiteBuild {
  const { pages: sources, assets } = collectSources(root, contentDir);
  const faults: BuildFault[] = [];

  const pages: Page[] = sources.map((source) => {
    const { frontMatter, body } = splitFrontMatter(source.markdown);
    return {
      ...source,
      frontMatter,
      body,
      url: urlOf(source.docPath),
      title: titleOf(frontMatter, body, source.docPath),
    };
  });

  const byDocPath = new Map(pages.map((page) => [page.docPath, page]));
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const assetPaths = new Set(assets.map((asset) => asset.path));
  const nav = buildNav(pages);

  const rendered = pages.map((page) => {
    const expanded = expandGenerated(root, page.docPath, page.body, pages);
    return { page, ...renderMarkdown(expanded) };
  });
  const slugsByUrl = new Map(rendered.map((entry) => [entry.page.url, entry.slugs]));

  const files: SiteFile[] = [
    ...assets,
    { path: 'assets/theme.css', contents: THEME_CSS },
    // GitHub Pages runs Jekyll over a branch unless told not to, and Jekyll drops
    // directories beginning with an underscore. Nothing here starts with one today;
    // the file is here so that the day something does, it still publishes.
    { path: '.nojekyll', contents: '' },
  ];

  for (const { page, html, slugs } of rendered) {
    void slugs;
    const linked = rewriteLinks(page, html, byUrl, byDocPath, slugsByUrl, assetPaths, faults);
    const archived = page.docPath.startsWith('archive/') && page.docPath !== 'archive/index.md';
    const depth = depthOf(page.url);
    files.push({
      path: outputPathOf(page.url),
      contents: renderPage({
        title: page.title,
        description: page.frontMatter.description ?? 'A demonstration harness with deliberately fake numerics.',
        bodyHtml: archived ? `${archiveBanner(depth)}\n${linked}` : linked,
        depth,
        nav,
        here: page.url,
      }),
    });
  }

  return { files, faults };
}
