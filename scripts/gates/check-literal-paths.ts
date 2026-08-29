/**
 * Gate: no literal paths, hosts or topic strings in component source
 * (Constitution IV). Every such string arrives through a configuration document.
 *
 * Scope: app/src, excluding tests (which construct configurations), generated
 * output, and the composition root (the one module that reads the configuration
 * document; ADR-0030). Exemptions are `// harness:allow-literal-path <reason>`.
 */
import { join } from 'node:path';
import { walk, scanForPatterns, isTestFile, type Finding, REPO_ROOT } from './lib.js';

const PATTERNS = [
  { pattern: /['"`](ctl|obs|adv|cov)\//, message: 'a literal topic string; topics come from configuration' },
  { pattern: /['"`]\/api\//, message: 'a literal seam path; endpoints come from configuration' },
  { pattern: /https?:\/\//, message: 'an absolute URL; the seam is relative and same-origin (FR-04)' },
];

export function runGate(root: string = REPO_ROOT): Finding[] {
  const files = walk(join(root, 'app', 'src'), (path) =>
    /\.tsx?$/.test(path) &&
    !isTestFile(path) &&
    !path.includes('/generated/') &&
    !path.includes('/bootstrap/'),
  );
  return scanForPatterns(files, PATTERNS, 'harness:allow-literal-path', root, { skipComments: true });
}
