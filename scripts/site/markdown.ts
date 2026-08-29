/**
 * Markdown, front matter and the two block syntaxes the V1 corpus uses.
 *
 * The renderer is markdown-it. It is build-time tooling and never ships to a reader:
 * what reaches the estate is HTML with no script and no fetched sub-resource. The
 * corpus was surveyed before this module was written — no footnotes, no mathematics,
 * no definition lists, no attribute lists, and admonitions of exactly two kinds — so
 * what is implemented here is what the content on disk actually uses, rather than a
 * reimplementation of a theme nobody is reading.
 */
import MarkdownIt from 'markdown-it';

export interface FrontMatter {
  readonly title?: string;
  readonly description?: string;
  readonly date?: string;
  readonly feature?: string;
  readonly categories?: readonly string[];
  readonly order?: number;
}

export interface ParsedPage {
  readonly frontMatter: FrontMatter;
  readonly body: string;
}

/**
 * A deliberately small YAML reader. The front matter in this corpus is flat scalars,
 * folded prose blocks and one list, and that is exactly what this reads. Anything
 * richer is a page doing something the site does not support, and it is better that it
 * arrive as an obviously empty field than as a half-understood one.
 */
export function splitFrontMatter(source: string): ParsedPage {
  const text = source.startsWith('\ufeff') ? source.slice(1) : source;
  if (!text.startsWith('---\n')) return { frontMatter: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { frontMatter: {}, body: text };
  const block = text.slice(4, end);
  const rest = text.slice(text.indexOf('\n', end + 1) + 1);

  const frontMatter: Record<string, unknown> = {};
  const lines = block.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[index]);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    const value = rawValue.trim();

    // A block scalar (`>-`, `>`, `|`) or an empty value opens an indented run: either
    // folded prose, as every entry's description is written, or a list of items.
    if (value === '' || /^[>|][-+]?$/.test(value)) {
      const indented: string[] = [];
      while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) {
        indented.push(lines[index + 1].trim());
        index += 1;
      }
      if (indented.every((entry) => entry.startsWith('- '))) {
        frontMatter[key] = indented.map((entry) => unquote(entry.slice(2)));
      } else {
        frontMatter[key] = indented.join(' ');
      }
      continue;
    }

    const scalar = unquote(value);
    frontMatter[key] = /^\d+$/.test(scalar) ? Number(scalar) : scalar;
  }
  return { frontMatter: frontMatter as FrontMatter, body: rest };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * `!!! kind "Title"` followed by an indented block, the Python-Markdown admonition
 * syntax the V1 pages are written in. Rewritten to a container the stylesheet knows,
 * with the body dedented so it renders as ordinary markdown inside it.
 */
export function expandAdmonitions(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opener = /^!!!\s+([a-z]+)(?:\s+"([^"]*)")?\s*$/.exec(lines[index]);
    if (!opener) {
      out.push(lines[index]);
      continue;
    }
    const [, kind, title] = opener;
    const block: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.trim() === '') {
        block.push('');
        cursor += 1;
        continue;
      }
      if (!/^\s{4}/.test(line)) break;
      block.push(line.slice(4));
      cursor += 1;
    }
    while (block.length > 0 && block[block.length - 1] === '') block.pop();
    out.push(`<div class="admonition admonition-${kind}">`);
    if (title) out.push(`<p class="admonition-title">${escapeHtml(title)}</p>`);
    out.push('');
    out.push(...block);
    out.push('');
    out.push('</div>');
    index = cursor - 1;
  }
  return out.join('\n');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const renderer = new MarkdownIt({ html: true, linkify: false, typographer: false });

export interface RenderedBody {
  readonly html: string;
  /** Every heading slug on the page, in order, so links to `#anchor` can be checked. */
  readonly slugs: readonly string[];
}

/** The heading slug rule. Punctuation goes, spaces become hyphens, collisions count up. */
export function slugify(text: string, taken: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const seen = taken.get(base);
  taken.set(base, (seen ?? 0) + 1);
  return seen === undefined ? base : `${base}-${seen}`;
}

function renderSegment(source: string, taken: Map<string, number>, slugs: string[]): string {
  const env = {};
  const tokens = renderer.parse(source, env);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'heading_open') continue;
    const inline = tokens[index + 1];
    const slug = slugify(inline?.content ?? '', taken);
    token.attrSet('id', slug);
    slugs.push(slug);
  }
  return renderer.renderer.render(tokens, renderer.options, env);
}

/**
 * markdown-it does not process markdown inside a raw HTML block, and the admonition
 * bodies above are exactly that. Rather than carry a plugin for it, the bodies are
 * rendered as their own documents and stitched back in: the container is HTML, its
 * contents are markdown, and neither has to know about the other. The heading counter
 * is shared across the segments, so two headings of the same name still get distinct
 * anchors when one of them sits inside an admonition.
 */
export function renderMarkdown(body: string): RenderedBody {
  const expanded = expandAdmonitions(body);
  const segments = expanded.split(/^(<div class="admonition[^\n]*>|<\/div>)$/m);
  const taken = new Map<string, number>();
  const slugs: string[] = [];
  const html = segments
    .map((segment) =>
      segment.startsWith('<div class="admonition') || segment === '</div>'
        ? segment
        : renderSegment(segment, taken, slugs),
    )
    .join('\n');
  return { html, slugs };
}

/** The heading text of the first `# ` line, for a page whose front matter omits a title. */
export function firstHeading(body: string): string | null {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : null;
}
