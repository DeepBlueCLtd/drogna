/**
 * Gate: Background is inert (feature 111 FR-004, SRD-v2 FR-44, SC-002).
 *
 * Background teaches the standards; it does not stand in for a component. So no
 * module under app/src/panels/background may import the seam, name a transport, or
 * reach for the run state the shell hands every panel. The tab must render
 * identically with every component stopped, and the way to keep that true is to make
 * the traffic unwritable rather than to test for its absence afterwards.
 *
 * This is the static half of SC-002. The runtime half is `background.test.tsx`,
 * which mounts the panel with a client whose every method throws and with nothing
 * started. Two checks rather than one because they fail differently: the gate catches
 * the import that has not been called yet, and the test catches the call that arrived
 * by a route the gate did not model. Both are watched failing against the planted
 * violation in scripts/gates/tests/fixtures/violations.
 *
 * The import-boundary gate already stops a panel importing `backend`. It permits
 * `seam`, which for this panel is still too much.
 *
 * Exemptions are `// harness:allow-background-traffic <reason>` — and there is no
 * reason that survives FR-004, so an exemption here is a specification change.
 */
import { dirname, join, relative, resolve } from 'node:path';
import { walk, readLines, isTestFile, hasMarker, type Finding, REPO_ROOT } from './lib.js';

const MARKER = 'harness:allow-background-traffic';

const PATTERNS: { pattern: RegExp; message: string }[] = [
  // A bare fetch(...) call. The negative lookbehind keeps `.fetch(` for the rule below
  // and keeps identifiers that merely end in 'fetch' out of it.
  { pattern: /(?<![\w$.])fetch\s*\(/, message: 'fetch(): Background issues no request across the seam (FR-004)' },
  {
    pattern: /\.\s*(?:fetch|subscribe|publish|request)\s*\(/,
    message: 'a transport call: Background neither asks nor listens (FR-004)',
  },
  {
    pattern: /new\s+(?:WebSocket|EventSource|XMLHttpRequest)\s*\(/,
    message: 'a network connection: Background renders with every component stopped (FR-004)',
  },
  { pattern: /\bsendBeacon\s*\(/, message: 'sendBeacon(): Background originates no traffic (FR-004)' },
  // The shell hands every panel the run's client, validator, manifest and
  // configuration. Background reads only its own slice of the address.
  {
    pattern: /\bparams\.(?:client|validator|manifest|config)\b/,
    message: 'Background reads no run state; it reads only params.address (FR-004)',
  },
];

export function runGate(root: string = REPO_ROOT): Finding[] {
  const srcRoot = join(root, 'app', 'src');
  const backgroundRoot = join(srcRoot, 'panels', 'background');
  // Two exclusions, both by name. Tests wire both halves the way the bootstrap does,
  // as they do for every other gate; and `fixtures/` holds the faults the runtime half
  // of SC-002 is watched catching, which is the one place in this tree the violation
  // belongs. Excluding them here is why the gate and the test are two checks: what
  // this gate stops scanning, that test is pointed straight at.
  const fixtures = join(backgroundRoot, 'fixtures');
  const files = walk(
    backgroundRoot,
    (path) => /\.tsx?$/.test(path) && !isTestFile(path) && !path.startsWith(fixtures),
  );
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = readLines(file);
    lines.forEach((line, index) => {
      if (hasMarker(lines, index, MARKER)) return;
      const trimmed = line.trimStart();
      const isComment =
        trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
      // An import is worth catching even where the line reads like prose, so the
      // import rule runs before comments are skipped.
      const specifier =
        /from\s+['"](\.[^'"]+)['"]/.exec(line)?.[1] ?? /import\(\s*['"](\.[^'"]+)['"]\s*\)/.exec(line)?.[1];
      if (specifier !== undefined) {
        const target = resolve(dirname(file), specifier);
        if (target.startsWith(join(srcRoot, 'seam'))) {
          findings.push({
            file: relative(root, file),
            line: index + 1,
            message: "Background may not import 'seam': it issues no request at all (FR-004)",
          });
        }
      }
      if (isComment) return;
      for (const { pattern, message } of PATTERNS) {
        if (pattern.test(line)) {
          findings.push({ file: relative(root, file), line: index + 1, message });
        }
      }
    });
  }
  return findings;
}
