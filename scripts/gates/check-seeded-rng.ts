/**
 * Gate: all stochastic behaviour derives from seeded streams (Constitution II).
 *
 * The one legitimate entropy site — seeding a fresh run's manifest at the
 * composition root — carries `// harness:allow-entropy <reason>` and is recorded in
 * the manifest it seeds. Everything else is a violation.
 */
import { join } from 'node:path';
import { walk, scanForPatterns, isTestFile, type Finding, REPO_ROOT } from './lib.js';

const PATTERNS = [
  { pattern: /\bMath\.random\s*\(/, message: 'Math.random() is unseeded entropy' },
  { pattern: /\bcrypto\.getRandomValues\b/, message: 'crypto.getRandomValues is entropy' },
  { pattern: /\brandomUUID\s*\(/, message: 'randomUUID is entropy; derive ids from seed + position' },
];

export function runGate(root: string = REPO_ROOT): Finding[] {
  const files = walk(join(root, 'app', 'src'), (path) =>
    /\.tsx?$/.test(path) && !isTestFile(path) && !path.includes('/generated/'),
  );
  return scanForPatterns(files, PATTERNS, 'harness:allow-entropy', root, { skipComments: true });
}
