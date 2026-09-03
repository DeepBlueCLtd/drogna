/**
 * The AT-04 proof's own verification, watched failing.
 *
 * Review of the commit that introduced it found that nothing held it: `pnpm check`,
 * `pnpm test` and `pnpm gates` all stayed green with the missing-test check deleted,
 * while the proof printed *held* over a file vitest had failed to collect. The gate
 * half is held by planted fixtures; this is the other half.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../gates/lib.js';
import { scan } from '../gates/check-replay-markers.js';
import { missingFrom, type Report } from '../replay-verify.js';

const marked = [
  { absolutePath: '/repo/app/src/a/one.test.ts', name: 'replays byte-identically' },
  { absolutePath: '/repo/app/src/b/two.test.ts', name: 'replays byte-identically' },
];

const report = (
  entries: { file: string; title: string; status: string }[],
): Report => ({
  testResults: entries.map((entry) => ({
    name: entry.file,
    assertionResults: [{ title: entry.title, status: entry.status }],
  })),
});

describe("the replay proof's verification", () => {
  it('holds when every marked test ran and passed', () => {
    const found = missingFrom(
      report([
        { file: '/repo/app/src/a/one.test.ts', title: 'replays byte-identically', status: 'passed' },
        { file: '/repo/app/src/b/two.test.ts', title: 'replays byte-identically', status: 'passed' },
      ]),
      marked,
    );
    expect(found).toEqual([]);
  });

  it('a skipped marked test is missing, not passed — the case a name filter cannot see', () => {
    // vitest exits 0 over a run in which everything is skipped, which is how the old
    // `-t replay` selector could report held while proving nothing.
    const found = missingFrom(
      report([
        { file: '/repo/app/src/a/one.test.ts', title: 'replays byte-identically', status: 'skipped' },
        { file: '/repo/app/src/b/two.test.ts', title: 'replays byte-identically', status: 'passed' },
      ]),
      marked,
    );
    expect(found.map((test) => test.absolutePath)).toEqual(['/repo/app/src/a/one.test.ts']);
  });

  it('a pass in one file cannot stand in for a skip of the same name in another', () => {
    // The two marked tests share a leaf title. Keyed on the title alone, the second
    // file's pass would satisfy the first file's skip — one level down from the hole
    // the proof exists to close, so it is asserted rather than assumed.
    const found = missingFrom(
      report([
        { file: '/repo/app/src/b/two.test.ts', title: 'replays byte-identically', status: 'passed' },
      ]),
      marked,
    );
    expect(found.map((test) => test.absolutePath)).toEqual(['/repo/app/src/a/one.test.ts']);
  });

  it('a file vitest never collected leaves its marked tests missing', () => {
    expect(missingFrom(report([]), marked)).toHaveLength(2);
    expect(missingFrom({}, marked)).toHaveLength(2);
  });

  it('a failed marked test is missing: only a pass counts', () => {
    const found = missingFrom(
      report([
        { file: '/repo/app/src/a/one.test.ts', title: 'replays byte-identically', status: 'failed' },
        { file: '/repo/app/src/b/two.test.ts', title: 'replays byte-identically', status: 'passed' },
      ]),
      marked,
    );
    expect(found.map((test) => test.absolutePath)).toEqual(['/repo/app/src/a/one.test.ts']);
  });

  it('the real tree has something to prove, and it includes the test the old selector skipped', () => {
    // Derived from the tree rather than typed in: a count here would be a number to
    // edit, where an empty set would mean the proof asserts nothing.
    const { marked: real } = scan(REPO_ROOT);
    expect(real.length).toBeGreaterThan(0);
    expect(real.some((test) => test.name.startsWith('AT-04 seed:'))).toBe(true);
    // And every marked test resolves to a file the proof will hand to vitest.
    expect(real.every((test) => test.absolutePath.startsWith(join(REPO_ROOT, 'app', 'src')))).toBe(
      true,
    );
  });
});
