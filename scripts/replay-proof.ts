/**
 * The one-command AT-04 replay proof (deferred from 105 and 107 to the arc's
 * close-out, deliberately): runs the byte-identity tests, and states the claim's
 * exact terms before it starts, so the proof and its boundary travel together.
 * Exit status is the verdict, propagated (a wrapper that does not check what it
 * wrapped is the fault CLAUDE.md documents).
 *
 * Which tests those are is derived from the tree, and the derivation is checked
 * both ways. Until feature 123's close-out this script selected with
 * `vitest run -t replay`, and the generator's own byte-identity test — `AT-04
 * seed: two runs from one root seed are byte-identical …`, in `describe('the
 * synthetic ocean (feature 102)')` — contains "replay" in neither string. So the
 * header named a test the command excluded: seven ran, the generator's was
 * skipped, and the proof printed *held* over the one property the generator is
 * most likely to lose. A name filter has no floor either — `vitest run -t
 * <anything unmatched>` skips every test and exits 0.
 *
 * A marker alone would only move the hole: a byte-identity test written without
 * one would sit outside the proof exactly as the generator's did, and the proof
 * would still print *held*. So there are two markers and a sweep:
 *
 *   AT-04: byte-identity        — in the proof; must run and pass.
 *   AT-04: not byte-identity    — considered and excluded, with the reason.
 *
 * Every test whose name looks like a determinism or replay claim must carry one
 * of the two. A new byte-identity test with neither fails this script by name,
 * which is the completeness check the marker on its own does not give.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** Carried on the line above a test that is part of the proof. */
const MARKER = 'AT-04: byte-identity';
/** Carried on the line above a test that looks like one and is not, with why. */
const EXCLUDED = 'AT-04: not byte-identity';
/** What the sweep considers a candidate. Deliberately wider than the marked set. */
const CANDIDATE = /replay|byte[- ]identical|byte for byte|deterministic|determinism|same seed/i;

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

const IT = /\bit(?:\.\w+)?\(\s*(['"`])([\s\S]*?)\1/;

type Marked = { file: string; name: string };

const marked: Marked[] = [];
const unreadable: string[] = [];
const unclassified: string[] = [];

for (const file of testFiles(srcDir)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const where = (index: number) => `${relative(repoRoot, file)}:${index + 1}`;

  lines.forEach((line, index) => {
    if (line.includes(MARKER)) {
      // The marker sits on the line above the test. Read the name from the `it(`
      // that follows it, and refuse rather than guess if there is not one.
      const name = IT.exec(lines[index + 1] ?? '')?.[2];
      if (name === undefined) unreadable.push(where(index + 1));
      else marked.push({ file, name });
      return;
    }
    // The sweep: a test that reads like a determinism claim must be classified.
    const name = IT.exec(line)?.[2];
    if (name === undefined || !CANDIDATE.test(name)) return;
    const above = lines[index - 1] ?? '';
    if (!above.includes(MARKER) && !above.includes(EXCLUDED)) {
      unclassified.push(`${where(index)} → ${name}`);
    }
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

if (unclassified.length > 0) {
  console.error(
    `replay proof FAILED: ${unclassified.length} test(s) read as a determinism or replay\n` +
      'claim and carry neither marker, so the proof cannot say whether it covers them.\n' +
      `Put "${MARKER}" above it to include it, or "${EXCLUDED}" with the reason:\n  ` +
      unclassified.join('\n  '),
  );
  process.exit(1);
}

// The floor the name filter never had: vitest exits 0 when it runs nothing at all.
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

// Outside the repository: an interrupted run must not leave a file for `git add
// -A` to sweep in, which is the fault CLAUDE.md records from V1.
const reportDir = mkdtempSync(join(tmpdir(), 'drogna-replay-proof-'));
const reportPath = join(reportDir, 'report.json');
// Both reporters: `default` so a divergence still prints which holding and which
// byte, `json` so this script can check that every marked test actually ran.
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    ...files.map((file) => relative(appDir, file)),
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportPath}`,
  ],
  { cwd: appDir, stdio: 'inherit' },
);

type Assertion = { title?: string; status?: string };
type Report = { testResults?: { name?: string; assertionResults?: Assertion[] }[] };

let report: Report | undefined;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
} catch {
  report = undefined;
}
rmSync(reportDir, { recursive: true, force: true });

if (report === undefined) {
  console.error(
    'replay proof FAILED: the suite produced no report, so nothing was proved. ' +
      `vitest exited ${result.status ?? 'without a status'}.`,
  );
  process.exit(result.status === 0 ? 1 : (result.status ?? 1));
}

// Passes are keyed by file as well as by name. A flat set of titles would let a
// passing test in one file satisfy a marked test that was skipped in another —
// the same shape of hole this script exists to close.
const passed = new Set<string>();
for (const file of report.testResults ?? []) {
  if (file.name === undefined) continue;
  for (const assertion of file.assertionResults ?? []) {
    if (assertion.status === 'passed' && assertion.title !== undefined) {
      passed.add(`${resolve(file.name)} ${assertion.title}`);
    }
  }
}

const missing = marked.filter((test) => !passed.has(`${resolve(test.file)} ${test.name}`));

if (missing.length > 0) {
  console.error(
    `replay proof FAILED: ${missing.length} of ${marked.length} marked byte-identity test(s)\n` +
      'did not run and pass — the proof asserts less than it claims. Each was skipped,\n' +
      'renamed away from its marker, never collected, or failed (the run above says which):\n  ' +
      missing.map((test) => `${relative(repoRoot, test.file)} → ${test.name}`).join('\n  '),
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    'replay proof FAILED: every marked test passed, so the failure above is in an ' +
      'unmarked test sharing one of their files. The replay claim itself still holds.',
  );
  process.exit(result.status ?? 1);
}

console.log(
  `replay proof held: all ${marked.length} marked byte-identity tests ran and reproduced ` +
    'their runs byte-identically',
);
