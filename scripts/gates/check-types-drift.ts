/**
 * Gate: the committed generated types match a fresh generation from the masters
 * (Constitution III). Regenerate into a scratch directory, diff, fail on drift —
 * including a file that exists in one place and not the other.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Finding, REPO_ROOT } from './lib.js';

export function runGate(root: string = REPO_ROOT, generatedDir?: string): Finding[] {
  const committed = generatedDir ?? join(root, 'app', 'src', 'generated');
  const scratch = mkdtempSync(join(tmpdir(), 'drogna-types-'));
  try {
    execSync('pnpm exec tsx scripts/generate-types.ts', {
      cwd: root,
      env: { ...process.env, DROGNA_GENERATED_OUT: scratch },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const findings: Finding[] = [];
    const fresh = readdirSync(scratch).sort();
    let inCommitted: string[];
    try {
      inCommitted = readdirSync(committed).sort();
    } catch {
      return [{ file: 'app/src/generated', line: 1, message: 'no committed generated output; run pnpm generate' }];
    }
    for (const name of fresh) {
      if (!inCommitted.includes(name)) {
        findings.push({ file: `app/src/generated/${name}`, line: 1, message: 'missing from the committed output; run pnpm generate' });
        continue;
      }
      const a = readFileSync(join(scratch, name), 'utf8');
      const b = readFileSync(join(committed, name), 'utf8');
      if (a !== b) {
        findings.push({ file: `app/src/generated/${name}`, line: 1, message: 'drifted from the masters; run pnpm generate' });
      }
    }
    for (const name of inCommitted) {
      if (!fresh.includes(name)) {
        findings.push({ file: `app/src/generated/${name}`, line: 1, message: 'committed but no master generates it; run pnpm generate' });
      }
    }
    return findings;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
