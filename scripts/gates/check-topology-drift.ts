/**
 * Gate: the committed topology artefact matches a fresh scan of the components'
 * configuration (SRD-v2 FR-25, E14). The topic list is derived, committed and
 * drift-gated — never hand-maintained — and a build whose committed artefact no
 * longer matches the declarations fails here.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Finding, REPO_ROOT } from './lib.js';

export function runGate(root: string = REPO_ROOT, committedPath?: string): Finding[] {
  const committed = committedPath ?? join(root, 'contracts', 'topology.json');
  const scratch = mkdtempSync(join(tmpdir(), 'drogna-topology-'));
  const freshPath = join(scratch, 'topology.json');
  try {
    execSync('pnpm exec tsx scripts/derive-topology.ts', {
      cwd: root,
      env: { ...process.env, DROGNA_TOPOLOGY_OUT: freshPath },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let committedText: string;
    try {
      committedText = readFileSync(committed, 'utf8');
    } catch {
      return [{ file: 'contracts/topology.json', line: 1, message: 'no committed topology; run pnpm generate' }];
    }
    const fresh = readFileSync(freshPath, 'utf8');
    if (fresh !== committedText) {
      return [
        {
          file: 'contracts/topology.json',
          line: 1,
          message: 'drifted from the components’ declarations; run pnpm generate',
        },
      ];
    }
    return [];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
