/**
 * Gate: no two workflows share a concurrency group (SRD-v2 NFR-04, D18).
 *
 * A shared group looks like mutual exclusion and is not. GitHub holds at most ONE
 * queued run per group: `cancel-in-progress: false` protects the run already going,
 * and the next run to join the group evicts and CANCELS the one waiting behind it.
 * So a group shared between a workflow that fires rarely and one that fires on every
 * push to every branch does not serialise the rare one — it drops it.
 *
 * This is not hypothetical. `site.yml` and `instances.yml` shared `gh-pages-estate`.
 * The V2 site publication queued at 12:34:45, a third estate run arrived at 12:34:47,
 * and the publication was cancelled at 12:34:49 with zero jobs ever started. Nothing
 * was red; the site simply never appeared, and the workflow's own comment said it
 * could not be cancelled. That comment is the shape of the fault: a serialisation
 * nobody had watched fail.
 *
 * Estate writers are serialised by the push loop instead — a losing push takes the
 * winner's state and re-places on top of it — which is a mechanism that can be run
 * and watched, unlike a queue one run deep.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, type Finding } from './lib.js';

const WORKFLOWS = join('.github', 'workflows');

interface Claim {
  readonly file: string;
  readonly group: string;
  readonly line: number;
}

const indentOf = (line: string): number => (/^(\s*)/.exec(line) as RegExpExecArray)[1].length;
const unquote = (value: string): string => value.replace(/^['"]/, '').replace(/['"]$/, '').trim();

/** Every concurrency group a workflow document claims — the block form and the inline one. */
export function groupsIn(text: string): { group: string; line: number }[] {
  const lines = text.split('\n');
  const claimed: { group: string; line: number }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const inline = /^\s*concurrency:\s*(\S.*)$/.exec(lines[index]);
    if (inline) {
      claimed.push({ group: unquote(inline[1]), line: index + 1 });
      continue;
    }
    if (!/^\s*concurrency:\s*$/.test(lines[index])) continue;

    const outer = indentOf(lines[index]);
    for (let inner = index + 1; inner < lines.length; inner += 1) {
      const line = lines[inner];
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      if (indentOf(line) <= outer) break;
      const group = /^\s*group:\s*(\S.*?)\s*$/.exec(line);
      if (group) claimed.push({ group: unquote(group[1]), line: inner + 1 });
    }
  }
  return claimed;
}

export function inspect(claims: readonly Claim[]): Finding[] {
  const byGroup = new Map<string, Claim[]>();
  for (const claim of claims) {
    byGroup.set(claim.group, [...(byGroup.get(claim.group) ?? []), claim]);
  }

  const findings: Finding[] = [];
  for (const [group, sharers] of [...byGroup].sort(([a], [b]) => a.localeCompare(b))) {
    if (sharers.length < 2) continue;
    for (const claim of sharers) {
      const others = sharers
        .filter((other) => other !== claim)
        .map((other) => other.file)
        .join(', ');
      findings.push({
        file: claim.file,
        line: claim.line,
        message:
          `the concurrency group '${group}' is shared with ${others} — GitHub keeps at most one ` +
          `queued run per group, so the next run to join it cancels this workflow's queued run ` +
          `rather than letting it wait (SRD-v2 NFR-04)`,
      });
    }
  }
  return findings;
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const directory = join(root, WORKFLOWS);
  if (!existsSync(directory)) return [];

  const claims = readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .flatMap((name) =>
      groupsIn(readFileSync(join(directory, name), 'utf8')).map((claim) => ({
        file: `${WORKFLOWS}/${name}`.replace(/\\/g, '/'),
        ...claim,
      })),
    );

  return inspect(claims);
}
