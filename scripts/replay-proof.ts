/**
 * The one-command AT-04 replay proof (deferred from 105 and 107 to the arc's
 * close-out, deliberately): runs every byte-identity test in the suite — the
 * generator's, the whole loop's, and the advisories-and-bundles one — and states
 * the claim's exact terms before it starts, so the proof and its boundary travel
 * together. Exit status is the verdict, propagated (a wrapper that does not check
 * what it wrapped is the fault CLAUDE.md documents).
 *
 * The set of tests is derived from the tree, not from a name filter. Until
 * feature 123's close-out this script selected with `vitest run -t replay`, and
 * the generator's own byte-identity test — `AT-04 seed: two runs from one root
 * seed are byte-identical …`, in `describe('the synthetic ocean (feature 102)')`
 * — contains "replay" in neither string. So the header above named a test the
 * command excluded: seven ran, the generator's was skipped, and the proof printed
 * *held* over the one property the generator is most likely to lose. A name
 * filter also has no floor — `vitest run -t <anything unmatched>` skips every
 * test and exits 0 — so a rename anywhere degraded the proof to nothing without
 * saying so.
 *
 * Each byte-identity test now carries the marker below on the line above it. This
 * script reads those markers off disk, runs the files that carry them, and
 * requires every marked test to have run and passed. A rename cannot shrink the
 * proof silently: the marker travels with the test, so the expected set and the
 * observed set move together only when a test is genuinely added or removed.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { readdirSync, readFileSync, rmSync } from 'node:fs';

/** The marker a byte-identity test carries, on the line above its `it(`. */
const MARKER = 'AT-04: byte-identity';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repoRoot, 'app');
const srcDir = join(appDir, 'src');

console.log(`AT-04 replay proof
==================
Claim: for a fixed seed, code revision and configuration, a lockstep run
reproduces byte-identical published holdings and identical control traffic.
Boundary: lockstep mode only (free-running modes reproduce drawn values, not
interleaving), and operator commands are ephemeral — deliberately outside the
claim, as the Intro states beside it. Since feature 113 a platform demand is a
command of that kind: the manifest carries no demand, so a demanded run replays
identically only when the same demands are issued at the same ticks. Feature 120's
pre-roll meets that proviso by construction and is therefore inside the claim: a
start condition's demands and prompts are configuration, issued at ticks the
configuration fixes, and the manifest records which condition the run began in. Inside the
claim, and new in 113: the platform's motion, and the sensors' sampling
positions, which are no longer a closed form over simulation time but the last
ownship report the sensors heard. That is a dependency on delivery order, which
lockstep makes deterministic and registration order makes stable — stated here
rather than left to be discovered. The run manifest is sufficient input.
`);

function testFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(path));
    else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) found.push(path);
  }
  return found;
}

/** A marked test: the file it lives in, and the name `it(...)` gives it. */
type Marked = { file: string; name: string };

const marked: Marked[] = [];
const unreadable: string[] = [];
for (const file of testFiles(srcDir)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (!line.includes(MARKER)) return;
    // The marker sits on the line above the test. Read the name from the `it(`
    // that follows it, and refuse rather than guess if there is not one.
    const next = lines[index + 1] ?? '';
    const name = /\bit(?:\.\w+)?\(\s*(['"`])([\s\S]*?)\1/.exec(next)?.[2];
    if (name === undefined) unreadable.push(`${relative(repoRoot, file)}:${index + 2}`);
    else marked.push({ file, name });
  });
}

if (unreadable.length > 0) {
  console.error(
    `replay proof FAILED: a "${MARKER}" marker is not directly above an it(...) with a\n` +
      `single-line name, so the proof cannot say which test it expects:\n  ` +
      unreadable.join('\n  '),
  );
  process.exit(1);
}

// The floor the name filter never had. An empty expected set is the failure mode
// that used to pass: vitest exits 0 when it runs nothing at all.
if (marked.length === 0) {
  console.error(
    `replay proof FAILED: no test in app/src carries the "${MARKER}" marker, so this\n` +
      'proof would assert nothing. Mark the byte-identity tests, or delete this script.',
  );
  process.exit(1);
}

const files = [...new Set(marked.map((test) => test.file))].sort();
console.log(
  `Proving ${marked.length} marked byte-identity test(s) across ${files.length} file(s):\n  ` +
    marked.map((test) => `${relative(repoRoot, test.file)} → ${test.name}`).join('\n  ') +
    '\n',
);

const reportPath = join(appDir, 'replay-proof-report.json');
rmSync(reportPath, { force: true });
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    ...files.map((file) => relative(appDir, file)),
    '--reporter=json',
    `--outputFile=${reportPath}`,
  ],
  { cwd: appDir, stdio: 'inherit' },
);

type Report = {
  testResults?: { assertionResults?: { title?: string; fullName?: string; status?: string }[] }[];
};

let report: Report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
} catch {
  console.error(
    'replay proof FAILED: the suite produced no report, so nothing was proved. ' +
      `vitest exited ${result.status ?? 'without a status'}.`,
  );
  process.exit(result.status === 0 ? 1 : (result.status ?? 1));
} finally {
  rmSync(reportPath, { force: true });
}

const passed = new Set<string>();
for (const file of report.testResults ?? []) {
  for (const assertion of file.assertionResults ?? []) {
    if (assertion.status === 'passed') {
      if (assertion.title !== undefined) passed.add(assertion.title);
      if (assertion.fullName !== undefined) passed.add(assertion.fullName);
    }
  }
}

// Every marked test must be in the run's passes. A test that was renamed out of
// the selector, skipped, or never collected is a hole in the proof, not a pass.
const missing = marked.filter(
  (test) => !passed.has(test.name) && ![...passed].some((title) => title.endsWith(test.name)),
);

if (missing.length > 0) {
  console.error(
    `replay proof FAILED: ${missing.length} of ${marked.length} marked byte-identity test(s)\n` +
      'did not run and pass — the proof asserts less than it claims:\n  ' +
      missing.map((test) => `${relative(repoRoot, test.file)} → ${test.name}`).join('\n  '),
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error('replay proof FAILED: a replay diverged, or the suite could not run');
  process.exit(result.status ?? 1);
}

console.log(
  `replay proof held: all ${marked.length} marked byte-identity tests ran and reproduced ` +
    'their runs byte-identically',
);
