/**
 * Every gate is watched failing before it is trusted: each is run here against a
 * fixture tree carrying exactly the violation it exists to catch, and against a
 * clean tree. A gate that stops matching looks exactly like a clean run — these
 * tests are what tells those two silences apart (CLAUDE.md, the one habit).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../gates/lib.js';
import { runGate as wallclock } from '../gates/check-wallclock.js';
import { runGate as seededRng } from '../gates/check-seeded-rng.js';
import { runGate as literalPaths } from '../gates/check-literal-paths.js';
import { runGate as vocabulary } from '../gates/check-vocabulary.js';
import { runGate as importBoundary } from '../gates/check-import-boundary.js';
import { runGate as typesDrift } from '../gates/check-types-drift.js';

const fixtures = join(REPO_ROOT, 'scripts', 'gates', 'tests', 'fixtures');
const violations = join(fixtures, 'violations');
const clean = join(fixtures, 'clean');

describe('each gate catches its planted violation and passes a clean tree', () => {
  it('wallclock', () => {
    const found = wallclock(violations);
    expect(found.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Date\.now/), expect.stringMatching(/setTimeout/)]),
    );
    expect(wallclock(clean)).toEqual([]);
  });

  it('seeded-rng', () => {
    expect(seededRng(violations).map((f) => f.message)).toEqual([
      expect.stringMatching(/Math\.random/),
    ]);
    expect(seededRng(clean)).toEqual([]);
  });

  it('literal-paths', () => {
    const messages = literalPaths(violations).map((f) => f.message);
    expect(messages).toHaveLength(3);
    expect(messages.join('\n')).toMatch(/topic string/);
    expect(messages.join('\n')).toMatch(/seam path/);
    expect(messages.join('\n')).toMatch(/absolute URL/);
    expect(literalPaths(clean)).toEqual([]);
  });

  it('vocabulary', () => {
    const messages = vocabulary(violations).map((f) => f.message);
    // harness:allow-forbidden-vocabulary asserting the gate names the word it caught
    expect(messages.join('\n')).toMatch(/'contact'/);
    // harness:allow-forbidden-vocabulary asserting the gate names the word it caught
    expect(messages.join('\n')).toMatch(/'detection'/);
    expect(vocabulary(clean)).toEqual([]);
  });

  it('import-boundary', () => {
    const found = importBoundary(violations);
    expect(found.map((f) => f.message)).toEqual([
      "'panels' may not import from 'backend' (Constitution XI)",
    ]);
    expect(importBoundary(clean)).toEqual([]);
  });

  it('types-drift: a stale committed tree fails; the real one passes', () => {
    const stale = typesDrift(REPO_ROOT, join(fixtures, 'stale-generated'));
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.map((f) => f.message).join('\n')).toMatch(/drifted|missing/);
    expect(typesDrift(REPO_ROOT)).toEqual([]);
  });
});

describe('the registry', () => {
  const registry = readFileSync(join(REPO_ROOT, 'scripts', 'gates.registry'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  it('carries every check-* script: an unregistered gate is a gate that never runs', () => {
    const onDisk = readdirSync(join(REPO_ROOT, 'scripts', 'gates'))
      .filter((name) => name.startsWith('check-') && name.endsWith('.ts'))
      .map((name) => `gates/${name}`);
    for (const gate of onDisk) expect(registry).toContain(gate);
  });

  it('names only files that exist', () => {
    for (const entry of registry) {
      expect(() => readFileSync(join(REPO_ROOT, 'scripts', entry))).not.toThrow();
    }
  });
});

describe('the runner', () => {
  it('reports a failing gate and a gate that could not run, and exits nonzero', () => {
    let stdout = '';
    let failed = false;
    try {
      stdout = execFileSync('pnpm', ['exec', 'tsx', 'scripts/run-gates.ts'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DROGNA_GATES_REGISTRY: join(fixtures, 'runner.registry'),
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (fault) {
      failed = true;
      const error = fault as { status: number; stdout: string; stderr: string };
      expect(error.status).toBe(1);
      expect(error.stderr).toMatch(/always fails, by design/);
      expect(error.stderr).toMatch(/could not run/);
    }
    expect(failed, `the runner exited 0 against a failing registry; stdout:\n${stdout}`).toBe(true);
  });
});
