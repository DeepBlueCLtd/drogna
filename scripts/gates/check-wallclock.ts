/**
 * Gate: no wall-clock time in operational code paths (Constitution I).
 *
 * Scans app/src, excluding tests (harness setup) and generated output. The permitted
 * exemptions — the clock's own real-time driver, heartbeat emission and liveness
 * evaluation (ADR-0006), render-path smoothing (ADR-0007) — are inline
 * `// harness:allow-wallclock <reason>` markers, each of which is reviewable text.
 */
import { join } from 'node:path';
import { walk, scanForPatterns, isTestFile, type Finding, REPO_ROOT } from './lib.js';

const PATTERNS = [
  { pattern: /\bDate\.now\s*\(/, message: 'Date.now() reads the host clock' },
  { pattern: /\bnew Date\s*\(\s*\)/, message: 'new Date() reads the host clock' },
  { pattern: /\bperformance\.now\s*\(/, message: 'performance.now() reads the host clock' },
  { pattern: /\bsetTimeout\s*\(/, message: 'setTimeout schedules against host time' },
  { pattern: /\bsetInterval\s*\(/, message: 'setInterval schedules against host time' },
  { pattern: /\brequestAnimationFrame\s*\(/, message: 'rAF timestamps are host time' },
];

export function runGate(root: string = REPO_ROOT): Finding[] {
  const files = walk(join(root, 'app', 'src'), (path) =>
    /\.tsx?$/.test(path) && !isTestFile(path) && !path.includes('/generated/'),
  );
  return scanForPatterns(files, PATTERNS, 'harness:allow-wallclock', root, { skipComments: true });
}
