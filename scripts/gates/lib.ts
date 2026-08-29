/**
 * Shared machinery for the constitution gates. A gate is a module exporting
 * `runGate(root?)` returning findings; the runner (`scripts/run-gates.ts`) reads the
 * registry and names no gate. Every gate accepts a root override so its own tests
 * can point it at a fixture tree carrying planted violations — the watched-failing
 * discipline, made permanent.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export function walk(root: string, keep: (path: string) => boolean): string[] {
  const results: string[] = [];
  const visit = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') visit(path);
      } else if (keep(path)) {
        results.push(path);
      }
    }
  };
  visit(root);
  return results;
}

export function readLines(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n');
}

export function isTestFile(path: string): boolean {
  // Basename only, deliberately: gates are pointed at fixture trees that live under
  // a tests/ directory, and a path-segment check would blind them there.
  return /\.test\.tsx?$/.test(path);
}

/** A marker on the offending line, or the line above it, exempts that line. */
export function hasMarker(lines: string[], index: number, marker: string): boolean {
  const here = lines[index] ?? '';
  const above = lines[index - 1] ?? '';
  return here.includes(marker) || above.includes(marker);
}

/** Comment-only lines are prose about the rule, not uses of the thing forbidden. */
export function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function scanForPatterns(
  files: string[],
  patterns: { pattern: RegExp; message: string }[],
  marker: string,
  root: string,
  options: { skipComments?: boolean } = {},
): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const lines = readLines(file);
    lines.forEach((line, index) => {
      if (options.skipComments && isCommentLine(line)) return;
      for (const { pattern, message } of patterns) {
        if (pattern.test(line) && !hasMarker(lines, index, marker)) {
          findings.push({ file: relative(root, file), line: index + 1, message });
        }
      }
    });
  }
  return findings;
}

export function printFindings(gate: string, findings: Finding[]): void {
  for (const finding of findings) {
    console.error(`${gate}: ${finding.file}:${finding.line}: ${finding.message}`);
  }
}
