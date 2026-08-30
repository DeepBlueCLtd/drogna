/**
 * Gate: nothing names a view the configuration does not declare (feature 115, FR-68,
 * SC-06).
 *
 * Feature 115 withdraws the System tab, and withdraws it properly: `#/view/system`
 * becomes an unknown view, handled as the shell already handles one. No redirect and no
 * tombstone — an address that resolves is a claim the thing still exists.
 *
 * The risk that creates is a link. Views have been addressable since feature 101 exactly
 * so that a pull request, a blog entry or a paragraph of the Intro tab can point a reader
 * at the thing being discussed (D16), and there were seven such links to System across
 * the tree when this was written. A search by hand finds the ones you think of. This gate
 * finds the rest, and goes on finding them at the *next* withdrawal, which is the reason
 * it exists rather than a checklist item in `tasks.md`.
 *
 * Three shapes are checked, because a view is named in three ways:
 *
 *   - a literal address, `#/view/<id>`, wherever it appears — TypeScript, markdown, CSS;
 *   - the helper that builds one, `hashForView('<id>')`;
 *   - the panel registry, whose keys are the views the shell can render — a key with no
 *     declared view is a panel that exists and cannot be reached, which is the same fault
 *     seen from the other end.
 *
 * The authority is `app/config/run.json`'s shell document and nothing else. That is the
 * point: the bound is read from disk, so withdrawing a view is a one-line edit to the
 * configuration and this gate then names every place that has not caught up (CLAUDE.md,
 * lesson 2).
 *
 * `harness:allow-view-id <reason>` on the line or the line above exempts a line. It is
 * expected to be used for prose *about* a withdrawn address — the record of why it went —
 * and not for a link.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { walk, readLines, hasMarker, REPO_ROOT, type Finding } from './lib.js';

/** `#/view/background/mqtt/3` names the view `background`; the remainder is opaque. */
const ADDRESS = /#\/view\/([a-z][a-z0-9_-]*)/g;
/** The helper the shell offers instead of writing the address out (`views.ts`). */
const HELPER = /hashForView\(\s*['"]([a-z][a-z0-9_-]*)['"]/g;
/** A key of `panelComponents`: `intro: IntroPanel,`. */
const REGISTRY_ENTRY = /^\s*([a-z][a-z0-9_-]*)\s*:\s*[A-Z]\w*\s*,\s*$/;

const REGISTRY = join('app', 'src', 'shell', 'registry.tsx');

function declaredViews(root: string): string[] {
  // A gate that cannot find its bound has proved nothing and must not look like a pass
  // (`run-gates.ts`), so both failures throw rather than returning no findings.
  const path = join(root, 'app', 'config', 'run.json');
  let document: { shell?: { views?: { id?: string }[] } };
  try {
    document = JSON.parse(readFileSync(path, 'utf8')) as typeof document;
  } catch (error) {
    throw new Error(`could not read app/config/run.json to learn which views exist: ${(error as Error).message}`);
  }
  const views = (document.shell?.views ?? []).flatMap((view) => (view.id ? [view.id] : []));
  if (views.length === 0) {
    throw new Error('app/config/run.json declares no shell views — the gate has nothing to hold the tree to');
  }
  return views;
}

/** The panel registry's keys, read as text: importing the module would pull in React. */
function registryKeys(root: string): { key: string; line: number }[] {
  let source: string[];
  try {
    source = readLines(join(root, REGISTRY));
  } catch {
    // A tree with no registry is a fixture tree; there is nothing to check and nothing
    // to claim, which is different from a missing bound.
    return [];
  }
  const start = source.findIndex((line) => line.includes('panelComponents'));
  if (start < 0) return [];
  const keys: { key: string; line: number }[] = [];
  for (let index = start + 1; index < source.length; index++) {
    if (source[index].startsWith('}')) break;
    const match = REGISTRY_ENTRY.exec(source[index]);
    if (match) keys.push({ key: match[1], line: index + 1 });
  }
  return keys;
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const declared = declaredViews(root);
  const findings: Finding[] = [];

  // Both roots, because a dangling link is the same fault wherever it is written and the
  // published site is where a reader meets one.
  const files = [
    ...walk(join(root, 'app', 'src'), (path) => /\.(tsx?|css|md)$/.test(path)),
    ...walk(join(root, 'site', 'docs'), (path) => /\.md$/.test(path)),
  ];
  for (const file of files) {
    const lines = readLines(file);
    lines.forEach((line, index) => {
      if (hasMarker(lines, index, 'harness:allow-view-id')) return;
      for (const pattern of [ADDRESS, HELPER]) {
        for (const match of line.matchAll(pattern)) {
          if (declared.includes(match[1])) continue;
          findings.push({
            file: relative(root, file),
            line: index + 1,
            message: `names the view '${match[1]}', which app/config/run.json does not declare — an address that resolves is a claim the thing still exists`,
          });
        }
      }
    });
  }

  for (const { key, line } of registryKeys(root)) {
    if (declared.includes(key)) continue;
    findings.push({
      file: REGISTRY,
      line,
      message: `the registry renders a panel for '${key}', which app/config/run.json does not declare as a view — a panel nothing can reach`,
    });
  }

  return findings;
}
