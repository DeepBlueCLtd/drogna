/**
 * Gate: no tracked-entity vocabulary in code, contracts or configuration
 * (Constitution V). A field named contact_id is a tracked entity whatever the
 * commentary says, so the boundaries treat any non-alphanumeric character as a
 * separator — snake_case, kebab-case and camelCase identifiers are all caught.
 *
 * The word list carries no customer or project name: a gate that listed them would
 * itself be the violation (V1's reasoning, carried). "track"/"tracking" remain
 * ordinary navigational English (Constitution V as amended 1.4.0); the entity nouns
 * are what is forbidden.
 */
import { join } from 'node:path';
import { join, relative } from 'node:path';
import { walk, readLines, hasMarker, type Finding, REPO_ROOT } from './lib.js';

const BEFORE = String.raw`(?<![A-Za-z0-9])`;
const AFTER = String.raw`(?![A-Za-z0-9])`;

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'tracked entity', pattern: new RegExp(BEFORE + String.raw`tracked[\s_-]+entit(?:y|ies)` + AFTER, 'i') },
  { label: 'tracklet', pattern: new RegExp(BEFORE + 'tracklets?' + AFTER, 'i') },
  { label: 'contact', pattern: new RegExp(BEFORE + 'contacts?' + AFTER, 'i') },
  { label: 'detection', pattern: new RegExp(BEFORE + 'detections?' + AFTER, 'i') },
];

const MARKER = 'harness:allow-forbidden-vocabulary';

export function runGate(root: string = REPO_ROOT): Finding[] {
  const roots = [join(root, 'app', 'src'), join(root, 'app', 'config'), join(root, 'contracts'), join(root, 'scripts')];
  const files = roots.flatMap((base) =>
    walk(base, (path) => {
      const rel = relative(root, path);
      // This gate's own word list, and the planted-violation fixtures, are the two
      // places the vocabulary legitimately appears; both are excluded by name.
      return (
        /\.(tsx?|json)$/.test(path) &&
        !rel.endsWith('check-vocabulary.ts') &&
        !rel.startsWith(join('scripts', 'gates', 'tests'))
      );
    }),
  );
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = readLines(file);
    lines.forEach((line, index) => {
      for (const { label, pattern } of FORBIDDEN) {
        if (pattern.test(line) && !hasMarker(lines, index, MARKER)) {
          findings.push({
            file: relative(root, file),
            line: index + 1,
            message: `forbidden vocabulary: '${label}' (Constitution V)`,
          });
        }
      }
    });
  }
  // Note the scope: test files are scanned too, unlike the other gates' scans —
  // a fixture is exactly where a data model acquires an entity by accident.
  return findings;
}
