/**
 * Gate: no component but the model runner declares what a run costs (SRD-v2 FR-115,
 * ADR-0043).
 *
 * The thing that will spend the compute is the thing that says what it comes to. A cost
 * figure in the scheduler's configuration would be a second copy of something the runner
 * owns, free to disagree with it — the scheduler could then hold a run against one number
 * while the run occupied a different one, and neither document would be wrong on its own
 * terms. That is the fault class this repository keeps finding: the timeline's
 * hand-written lane list that feature 116's new era never reached, the analyst's threshold
 * copied where the divergence rule could not see it. It is caught here rather than
 * remembered.
 *
 * **The bound is read from disk and never typed here.** The forbidden vocabulary is the
 * name of the model runner's own cost block, taken from
 * `contracts/schemas/config.model-runner.schema.json`. Rename that block and this gate
 * changes what it looks for; delete it and the gate refuses to run rather than reporting
 * clean, because a gate that cannot find its bound has proved nothing (`run-gates.ts`).
 *
 * **A topic naming the cost is not a declaration of it.** The scheduler subscribes to
 * `run_cost` and the shell reads it; that is the design working. Property names inside a
 * `topics` object are therefore exempt, and only there — a `run_cost_ticks` beside
 * `min_interval_ticks` is exactly what this gate exists to catch.
 *
 * **What it does not cover, said plainly, because the sentence above is broader than the
 * code beneath it.** This reads configuration: the masters components are built from, and
 * the document they are built from. A cost typed into a component's *source* — `const
 * RUN_COST_TICKS = 12` in the scheduler — passes it clean, and so does one added to a
 * message master rather than a configuration one. Those are worth catching and this does
 * not catch them; the fault ADR-0043 names is a second copy of the figure in a document
 * somebody would edit to change it, and that is the fault this holds.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { walk, readLines, REPO_ROOT, type Finding } from './lib.js';

/** The master that owns the figure. Everything else is held against it. */
const OWNER = 'config.model-runner.schema.json';
/** The one configuration document key whose component is entitled to declare a cost. */
const OWNER_KEY = 'model_runner';

/**
 * The token a cost-bearing property name contains, read from the owner's own block name.
 * Throws rather than returning nothing: an empty vocabulary would report every tree clean.
 */
function costToken(root: string): string {
  const path = join(root, 'contracts', 'schemas', OWNER);
  let document: { properties?: Record<string, unknown> };
  try {
    document = JSON.parse(readFileSync(path, 'utf8')) as typeof document;
  } catch (error) {
    throw new Error(`could not read ${OWNER} to learn what a cost declaration is called: ${(error as Error).message}`);
  }
  const named = Object.keys(document.properties ?? {}).filter((key) => /cost/i.test(key));
  if (named.length !== 1) {
    throw new Error(
      `${OWNER} declares ${named.length} cost-shaped blocks (${named.join(', ') || 'none'}); this gate holds the tree to exactly one, ` +
        'because the vocabulary it forbids elsewhere is that block’s own name',
    );
  }
  return named[0];
}

/** Which line a key sits on, so a finding points at the property and not at the file. */
function lineOf(lines: string[], key: string): number {
  const index = lines.findIndex((line) => line.includes(`"${key}"`));
  return index < 0 ? 1 : index + 1;
}

/**
 * Every property name below `node` that carries the token, with the path it sits at.
 * Descent stops at a `topics` object: subscribing to where the cost is published is the
 * design, not a second declaration of it.
 */
function offendingKeys(node: unknown, token: string, path: string, insideTopics: boolean): { key: string; path: string }[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((entry, index) => offendingKeys(entry, token, `${path}/${index}`, insideTopics));
  const found: { key: string; path: string }[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const nowInsideTopics = insideTopics || key === 'topics';
    if (!nowInsideTopics && new RegExp(token, 'i').test(key)) {
      found.push({ key, path: `${path}/${key}` });
    }
    found.push(...offendingKeys(value, token, `${path}/${key}`, nowInsideTopics));
  }
  return found;
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const token = costToken(root);
  const findings: Finding[] = [];

  const masters = walk(join(root, 'contracts', 'schemas'), (path) => /config\.[a-z0-9.-]+\.schema\.json$/.test(path));
  for (const file of masters) {
    if (file.endsWith(OWNER)) continue;
    const lines = readLines(file);
    const document = JSON.parse(lines.join('\n')) as unknown;
    // Only the shapes a component is configured with. A `description` is prose about the
    // rule and is not a declaration; `offendingKeys` walks keys, never values.
    for (const { key, path } of offendingKeys(document, token, '', false)) {
      findings.push({
        file: relative(root, file),
        line: lineOf(lines, key),
        message: `declares '${key}' at ${path}, which reads as a run's cost — only ${OWNER} may declare one (FR-115, ADR-0043). A second copy is free to disagree with the figure the run actually occupies`,
      });
    }
  }

  const configPath = join(root, 'app', 'config', 'run.json');
  let run: Record<string, unknown>;
  try {
    run = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // A fixture tree with no run document has nothing to check here; the masters above
    // still ran, so this is not a gate that found no bound.
    return findings;
  }
  const runLines = readLines(configPath);
  for (const [component, document] of Object.entries(run)) {
    if (component === OWNER_KEY) continue;
    for (const { key, path } of offendingKeys(document, token, `/${component}`, false)) {
      findings.push({
        file: relative(root, configPath),
        line: lineOf(runLines, key),
        message: `'${component}' declares '${key}' at ${path}, which reads as a run's cost — the model runner is the sole publisher of that figure (FR-115, ADR-0043)`,
      });
    }
  }
  return findings;
}
