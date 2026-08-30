/**
 * Build the committed seed-data artefacts (feature 120, ADR-0041).
 *
 * This is the *whole* of what makes a snapshot legitimate, so it is worth being plain
 * about what it does and does not do. It does not write a file describing an ocean. It
 * constructs the backend — every component, from the shipped configuration document,
 * validated against its master — and drives the chosen condition's pre-roll through the
 * operator plane, exactly as the browser does. Then it takes the holdings the coverage
 * store is left holding and writes those bytes out.
 *
 * The output is therefore derived, in the same sense `app/src/generated/` is derived, and
 * it answers to the same discipline: `check-snapshot-drift` runs this again and fails the
 * build on any difference. That check is the reason the constitution's Data constraint
 * could be amended at 2.1.0 rather than simply broken, and an artefact committed without
 * it would be the fixture the rule forbids.
 *
 * The one thing the build does differently from the page: it runs the condition's script
 * as written, with every component running, because it is producing what those components
 * author. The page holds back whoever the artefact speaks for (`holdingBack`). One script,
 * two crews — the alternative was two scripts, and two scripts drift.
 *
 * Usage: pnpm snapshots [--check]
 *   --check writes nothing and reports what would differ; that is what the gate runs.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { ConfigRun, ConfigStartConditionsCondition } from '../app/src/generated/types.js';
import { createSeamValidator } from '../app/src/seam/validate.js';
import { buildBackend } from '../app/src/backend/runtime/runtime.js';
import { encodeSnapshot } from '../app/src/backend/snapshot/codec.js';
import { configForCondition } from '../app/src/bootstrap/start-condition.js';
import { runPreRoll } from '../app/src/bootstrap/preroll.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_DIR = join(repoRoot, 'app', 'public', 'snapshots');

/**
 * `setImmediate`, not a timer: the yield exists to let the event loop turn between
 * bursts of stepped ticks, arms nothing against host time and reads no clock — the
 * argument `app/src/backend/test-support/drive.ts` sets out at length for the same call.
 */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

function revision(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unversioned';
  }
}

/** The bytes one condition's artefact should contain, built by running the components. */
export async function buildSnapshot(
  config: ConfigRun,
  condition: ConfigStartConditionsCondition,
  codeRevision: string,
): Promise<Uint8Array> {
  const eras = new Set(condition.snapshot_eras ?? []);
  const effective = configForCondition(config, condition);
  const validator = createSeamValidator();
  const runtime = buildBackend(
    effective,
    {
      rootSeed: condition.root_seed,
      startCondition: condition.id,
      revision: codeRevision,
      dirty: false,
      // No artefact while building one: the source runs, finds nothing to replay, and
      // says so. Handing it the previous artefact would let a stale one perpetuate
      // itself through every rebuild, which is the one way a drift gate can be defeated.
      snapshot: undefined,
    },
    validator,
  );
  try {
    await runPreRoll(
      {
        backend: runtime.httpBackend,
        clock: effective.clock,
        operator: effective.operator,
        breathe,
        onProgress: () => undefined,
      },
      condition,
    );
    runtime.clock.stop();
    const held = runtime.store
      .holdings()
      .filter((descriptor) => eras.has(descriptor.era))
      .map((descriptor) => {
        const holding = runtime.store.holding(descriptor.holding_id);
        if (!holding) throw new Error(`the store lost '${descriptor.holding_id}' between listing and reading it`);
        return holding;
      })
      // Publication order, which is the order the era pointers moved in. `holdings()`
      // returns insertion order and a re-published now-cast replaces its predecessor
      // in place, so this sorts by the instant each records rather than trusting that.
      .sort((a, b) => a.descriptor.published_at.tick - b.descriptor.published_at.tick);
    if (held.length === 0) {
      throw new Error(
        `'${condition.id}' declares eras ${[...eras].join(', ')} and the run produced no holding in any of them`,
      );
    }
    return await encodeSnapshot(
      {
        format: 'drogna-snapshot-1',
        start_condition: condition.id,
        run_id: runtime.runId,
        root_seed: condition.root_seed,
        config_digest: held[0].descriptor.manifest.config_digest,
        code_revision: codeRevision,
      },
      held,
    );
  } finally {
    runtime.stop();
  }
}

export function conditionsWithArtefacts(config: ConfigRun): ConfigStartConditionsCondition[] {
  return config.start_conditions.conditions.filter(
    (condition) => (condition.snapshot_eras ?? []).length > 0,
  );
}

export function readConfig(root: string = repoRoot): ConfigRun {
  return JSON.parse(readFileSync(join(root, 'app', 'config', 'run.json'), 'utf8')) as ConfigRun;
}

export function artefactFile(conditionId: string, config: ConfigRun, dir: string = SNAPSHOT_DIR): string {
  return join(dir, `${conditionId}${config.snapshot_source.artefacts.path_suffix}`);
}

async function main(): Promise<void> {
  const checking = process.argv.includes('--check');
  const config = readConfig();
  const codeRevision = revision();
  const conditions = conditionsWithArtefacts(config);
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const differences: string[] = [];
  const wanted = new Set<string>();
  for (const condition of conditions) {
    const built = await buildSnapshot(config, condition, codeRevision);
    const path = artefactFile(condition.id, config);
    wanted.add(`${condition.id}${config.snapshot_source.artefacts.path_suffix}`);
    if (checking) {
      let committed: Buffer | undefined;
      try {
        committed = readFileSync(path);
      } catch {
        differences.push(`${condition.id}: no committed artefact; run 'pnpm snapshots'`);
        continue;
      }
      // The header carries the code revision, which moves on every commit and says
      // nothing about the fields. Comparing whole files would fail on every commit and
      // teach everybody to regenerate without reading why, so the comparison is over
      // what the components produced: the descriptors and the field bytes.
      if (!(await sameContents(committed, built))) {
        differences.push(`${condition.id}: the committed artefact is not what the components now author`);
      }
    } else {
      writeFileSync(path, built);
      console.log(`${path}  ${(built.byteLength / 1e6).toFixed(2)} MB`);
    }
  }

  // A file nobody claims is dead weight in the estate and, worse, is a snapshot for a
  // condition that no longer exists — which would be silently served to anyone whose
  // link still names it.
  for (const entry of readdirSync(SNAPSHOT_DIR)) {
    if (!wanted.has(entry)) differences.push(`${entry}: no condition declares this artefact`);
  }

  if (checking && differences.length > 0) {
    for (const difference of differences) console.error(difference);
    process.exit(1);
  }
}

/** Equal in what the components produced: the same holdings, descriptors and bytes. */
export async function sameContents(one: Uint8Array, other: Uint8Array): Promise<boolean> {
  const { decodeSnapshot } = await import('../app/src/backend/snapshot/codec.js');
  const [a, b] = [await decodeSnapshot(one), await decodeSnapshot(other)];
  if (a.holdings.length !== b.holdings.length) return false;
  for (const [index, holding] of a.holdings.entries()) {
    const mate = b.holdings[index];
    if (JSON.stringify(holding.descriptor) !== JSON.stringify(mate.descriptor)) return false;
    if (holding.bytes.byteLength !== mate.bytes.byteLength) return false;
    for (let i = 0; i < holding.bytes.byteLength; i += 1) {
      if (holding.bytes[i] !== mate.bytes[i]) return false;
    }
  }
  return (
    a.header.run_id === b.header.run_id &&
    a.header.root_seed === b.header.root_seed &&
    a.header.start_condition === b.header.start_condition &&
    a.header.config_digest === b.header.config_digest
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
