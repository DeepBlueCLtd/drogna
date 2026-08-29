/**
 * Gate: no import across the seam (Constitution XI, ADR-0030).
 *
 * Areas under app/src: shell, panels, seam, generated, backend, bootstrap.
 *   - shell/panels may import: shell, panels, seam, generated
 *   - backend may import: backend, seam, generated
 *   - seam may import: seam, generated
 *   - generated may import: generated
 *   - bootstrap may import everything except nothing may import bootstrap
 * Tests are excluded: a test wires both halves the way the bootstrap does.
 */
import { dirname, join, relative, resolve } from 'node:path';
import { walk, readLines, isTestFile, type Finding, REPO_ROOT } from './lib.js';

const AREAS = ['shell', 'panels', 'seam', 'generated', 'backend', 'bootstrap'] as const;
type Area = (typeof AREAS)[number];

const ALLOWED: Record<Area, readonly Area[]> = {
  shell: ['shell', 'panels', 'seam', 'generated'],
  panels: ['shell', 'panels', 'seam', 'generated'],
  seam: ['seam', 'generated'],
  generated: ['generated'],
  backend: ['backend', 'seam', 'generated'],
  bootstrap: ['shell', 'panels', 'seam', 'generated', 'backend', 'bootstrap'],
};

function areaOf(srcRoot: string, path: string): Area | undefined {
  const segment = relative(srcRoot, path).split('/')[0];
  return AREAS.includes(segment as Area) ? (segment as Area) : undefined;
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const srcRoot = join(root, 'app', 'src');
  const files = walk(srcRoot, (path) => /\.tsx?$/.test(path) && !isTestFile(path));
  const findings: Finding[] = [];
  for (const file of files) {
    const fromArea = areaOf(srcRoot, file);
    if (!fromArea) continue;
    const lines = readLines(file);
    lines.forEach((line, index) => {
      const specifier =
        /from\s+['"](\.[^'"]+)['"]/.exec(line)?.[1] ?? /import\(\s*['"](\.[^'"]+)['"]\s*\)/.exec(line)?.[1];
      if (!specifier) return;
      const target = resolve(dirname(file), specifier);
      if (!target.startsWith(srcRoot)) return; // config documents and assets are data
      const toArea = areaOf(srcRoot, target);
      if (!toArea) return;
      if (!ALLOWED[fromArea].includes(toArea)) {
        findings.push({
          file: relative(root, file),
          line: index + 1,
          message: `'${fromArea}' may not import from '${toArea}' (Constitution XI)`,
        });
      }
    });
  }
  return findings;
}
