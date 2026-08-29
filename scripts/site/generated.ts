/**
 * The parts of the site nobody writes by hand.
 *
 * Each of these exists because the alternative is a second copy of something the
 * repository already holds, and the second copy is the one that goes stale on the
 * public site. The direction of travel is always out of the tree and into the page:
 * nothing here writes back into `site/docs/`.
 *
 *   component reference   from contracts/topology.json — the same master the app is
 *                         built against, so a component that appears in one appears
 *                         in the other or the topology-drift gate has already failed
 *   topic reference       likewise, including which component says each topic's name
 *   decision records      from docs/adr/ — the status is read out of the record, never
 *                         retyped, which is how V1's index was kept honest
 *   blog coverage         features under specs/ against the entries that name them,
 *                         so a feature with no entry gets a row saying so
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { firstHeading, splitFrontMatter } from './markdown.js';

export interface Topology {
  readonly components: readonly { id: string; role: string; source_root: string | null }[];
  readonly roles: readonly { role: string; rules: readonly { access: string; filter: string }[] }[];
  readonly topics: readonly {
    topic: string;
    namespace: string;
    schema: string | null;
    publishers: readonly string[];
    subscribers: readonly string[];
    named_by: readonly { component: string | null; path: string; line: number }[];
  }[];
}

export function readTopology(root: string): Topology {
  return JSON.parse(readFileSync(join(root, 'contracts', 'topology.json'), 'utf8')) as Topology;
}

function code(value: string): string {
  return `\`${value}\``;
}

function list(values: readonly string[]): string {
  return values.length === 0 ? '—' : values.map(code).join(', ');
}

export function componentTable(topology: Topology): string {
  const rows = topology.components.map((component) => {
    const role = topology.roles.find((entry) => entry.role === component.role);
    const writes = (role?.rules ?? []).filter((rule) => rule.access === 'write').map((rule) => rule.filter);
    const reads = (role?.rules ?? []).filter((rule) => rule.access === 'read').map((rule) => rule.filter);
    const source = component.source_root ? code(component.source_root) : '_not a module_';
    return `| ${code(component.id)} | ${source} | ${list(writes)} | ${list(reads)} |`;
  });
  return [
    '| Component | Source | May publish on | May subscribe to |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function topicTable(topology: Topology): string {
  const rows = topology.topics.map((topic) => {
    const schema = topic.schema ? code(topic.schema.replace(/^contracts\/schemas\//, '')) : '—';
    return `| ${code(topic.topic)} | ${schema} | ${list(topic.publishers)} | ${list(topic.subscribers)} |`;
  });
  return ['| Topic | Message schema | Published by | Subscribed by |', '|---|---|---|---|', ...rows].join('\n');
}

export interface DecisionRecord {
  readonly file: string;
  readonly number: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly markdown: string;
}

/** `# ADR 0027 — Title` and `# ADR-0010: Title` are both in the corpus. */
function titleOf(markdown: string, fallback: string): string {
  const heading = firstHeading(markdown) ?? fallback;
  return heading.replace(/^ADR[\s-]*\d+\s*[—:-]\s*/i, '').trim();
}

/**
 * The status as the record states it, first line only. A record whose status has been
 * amended says so on that line, and a summary that dropped the amendment would be the
 * kind of second copy this module exists to avoid.
 */
function statusOf(markdown: string): string {
  const match = /^\*\*Status:\*\*\s*(.+)$/m.exec(markdown);
  if (!match) return 'not stated';
  return match[1].replace(/\s+$/, '').replace(/\.$/, '');
}

export function readDecisionRecords(root: string): DecisionRecord[] {
  const dir = join(root, 'docs', 'adr');
  return readdirSync(dir)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort()
    .map((name) => {
      const markdown = readFileSync(join(dir, name), 'utf8');
      const [number] = name.split('-');
      return {
        file: name,
        number,
        slug: name.replace(/\.md$/, ''),
        title: titleOf(markdown, name),
        status: statusOf(markdown),
        markdown,
      };
    });
}

export function decisionIndexTable(records: readonly DecisionRecord[]): string {
  const rows = records.map(
    (record) => `| ${record.number} | [${record.title}](adr/${record.slug}.md) | ${record.status} |`,
  );
  return ['| # | Decision | Status |', '|---|---|---|', ...rows].join('\n');
}

/**
 * Every V2 feature against the entries that name it. A feature with no entry gets a
 * row saying so: the gap is the reason the table is published at all (V1's FR-016,
 * carried, with the numbering moved to the 1NN series).
 */
export function blogCoverageTable(
  root: string,
  posts: readonly Entry[],
  series: RegExp,
): string {
  const features = readdirSync(join(root, 'specs'))
    .filter((name) => series.test(name))
    .sort();
  const rows = features.map((feature) => {
    const number = feature.slice(0, 3);
    const named = posts.filter((post) => featureNumber(post.feature) === number);
    const entries =
      named.length === 0
        ? '_no entry yet_'
        : named.map((post) => `[${post.title}](${post.url})`).join(', ');
    return `| ${number} | ${feature.slice(4).replace(/-/g, ' ')} | ${entries} |`;
  });
  return ['| Feature | Beat | Entries |', '|---|---|---|', ...rows].join('\n');
}

export interface Entry {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly feature?: string;
}

/**
 * An entry names its feature as a path (`specs/001-deterministic-foundations`), so the
 * number is read out of it rather than compared against it. A hand-typed number beside
 * a path is a second copy of the same fact.
 */
function featureNumber(feature: string | undefined): string | null {
  const match = feature ? /(\d{3})/.exec(feature) : null;
  return match ? match[1] : null;
}

export function readEntry(url: string, markdown: string): Entry {
  const { frontMatter, body } = splitFrontMatter(markdown);
  return {
    url,
    title: frontMatter.title ?? firstHeading(body) ?? 'Untitled',
    description: frontMatter.description ?? '',
    date: frontMatter.date ?? '',
    feature: frontMatter.feature,
  };
}

/** Entries newest first, each with the sentence its own front matter opens with. */
export function entryList(entries: readonly Entry[]): string {
  if (entries.length === 0) {
    return '_No entries yet._ The first will be written when the first significant component arrives.';
  }
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return sorted
    .map((entry) => {
      const day = entry.date.slice(0, 10);
      const summary = entry.description ? `\n\n    ${entry.description}` : '';
      return `- **[${entry.title}](${entry.url})** — ${day}${summary}`;
    })
    .join('\n\n');
}
