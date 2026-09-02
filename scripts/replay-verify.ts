/**
 * The AT-04 proof's verification, separated from the process it runs so that it can
 * be tested.
 *
 * It was not, and review said so plainly: `scripts/replay-proof.ts` grew about a
 * hundred lines deciding whether the proof held, and nothing imported it, nothing
 * typechecked it and nothing exercised it. Deleting the missing-test check left
 * `pnpm check`, `pnpm test` and `pnpm gates` all green while the proof printed
 * *held* over a file vitest had failed to collect — the fault the whole change
 * exists to close, reintroduced with nothing to catch it. The gate half is held
 * permanently by planted fixtures; this half now is too.
 */
import { resolve } from 'node:path';
import type { MarkedTest } from './gates/check-replay-markers.js';

/** The shape this reads out of vitest's JSON reporter. */
export interface Report {
  readonly testResults?: {
    readonly name?: string;
    readonly assertionResults?: { readonly title?: string; readonly status?: string }[];
  }[];
}

/**
 * The key a pass is recorded under: the resolved file, then the leaf title.
 *
 * Keyed by file as well as by name because vitest's `title` is the leaf only, with
 * no ancestor `describe`. A flat set of titles would let a passing test in one file
 * satisfy a marked test that was skipped in another — one level down from the hole
 * this proof exists to close. `\0` cannot occur in either half, where a space could:
 * a path and a title may both contain one.
 */
function key(file: string, title: string): string {
  return `${resolve(file)}\0${title}`;
}

/**
 * The marked tests that did not run and pass. A test that was skipped, renamed away
 * from its marker, never collected, or that failed, is a hole in the proof — not a
 * pass. Only `status === 'passed'` counts, so a `skipped` entry is missing, which is
 * the case a name filter could never see.
 */
export function missingFrom(report: Report, marked: readonly MarkedTest[]): MarkedTest[] {
  const passed = new Set<string>();
  for (const file of report.testResults ?? []) {
    if (file.name === undefined) continue;
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === 'passed' && assertion.title !== undefined) {
        passed.add(key(file.name, assertion.title));
      }
    }
  }
  return marked.filter((test) => !passed.has(key(test.absolutePath, test.name)));
}
