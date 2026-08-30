/**
 * Gate: every committed seed-data artefact is what the components would author now
 * (the Constitution's Data constraint, as amended at 2.1.0; ADR-0040).
 *
 * This gate is the reason the amendment could be written at all. Without it, a snapshot
 * is a fixture: bytes in the repository that a page opens a console over, answerable to
 * nothing, and drifting the moment anybody changes the analytic form, the grid, a seed
 * or a leg of a pre-roll — silently, because the coverage store's digest check only
 * proves the bytes match the descriptor that travelled with them, and a stale pair is
 * internally consistent. With it, the artefact is derived output held to its generator,
 * exactly as `app/src/generated/` is held to `contracts/` by the types-drift gate.
 *
 * It runs the real thing: constructs the backend from the shipped configuration and
 * drives each condition's pre-roll, then compares descriptors and field bytes against
 * what is committed. That is slow — tens of seconds, the dearest gate in the registry by
 * an order of magnitude — and the alternative is a cheaper check that proves less, which
 * is the trade this repository has refused before (CLAUDE.md, lesson 2).
 *
 * The code revision in the header is deliberately outside the comparison. It moves on
 * every commit and says nothing about the fields, so including it would fail the gate on
 * every commit and teach everybody to regenerate without reading why — which is how a
 * check stops being read at all.
 *
 * It is the first asynchronous gate, which turned up a hazard in the runner that had been
 * there since the registry existed: an un-awaited `runGate` returning a promise was read
 * for a `.length` it does not have and reported clean. Fixed in `run-gates.ts`, where it
 * belongs, rather than worked around here.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  artefactFile,
  buildSnapshot,
  conditionsWithArtefacts,
  readConfig,
  sameContents,
} from '../build-snapshots.js';
import { REPO_ROOT, type Finding } from './lib.js';

export async function runGate(root: string = REPO_ROOT): Promise<Finding[]> {
  const config = readConfig(root);
  const conditions = conditionsWithArtefacts(config);
  // A gate that cannot find its subject has proved nothing and must not look like a pass
  // (`run-gates.ts`). If no condition declares an artefact the gate is vacuous, and that
  // is a fact worth stating rather than a green tick.
  if (conditions.length === 0) {
    throw new Error(
      'no start condition declares snapshot_eras, so this gate would pass without checking anything',
    );
  }
  const findings: Finding[] = [];
  for (const condition of conditions) {
    const path = artefactFile(condition.id, config);
    const where = relative(root, path);
    let committed: Buffer;
    try {
      committed = readFileSync(path);
    } catch {
      findings.push({
        file: where,
        line: 1,
        message: `'${condition.id}' declares eras ${(condition.snapshot_eras ?? []).join(', ')} and no artefact is committed; run 'pnpm snapshots'`,
      });
      continue;
    }
    const built = await buildSnapshot(config, condition, 'gate');
    let same: boolean;
    try {
      same = await sameContents(committed, built);
    } catch (fault) {
      // A committed artefact that cannot even be read is a finding about that file, not
      // a gate that could not run: the runner's catch would report it as the latter,
      // with whatever message the decompressor happened to carry — and a corrupted gzip
      // stream carries none at all, so the whole report was "could not run — ". Watched.
      findings.push({
        file: where,
        line: 1,
        message:
          `the committed artefact cannot be read back: ${(fault as Error).message || 'it is not a readable snapshot'}. ` +
          `Its bytes have been damaged since they were written; run 'pnpm snapshots'.`,
      });
      continue;
    }
    if (!same) {
      findings.push({
        file: where,
        line: 1,
        message:
          `the committed artefact is not what the components now author for '${condition.id}'. ` +
          `Something the fields depend on has moved — the analytic form, the grid, the seed, ` +
          `or a leg of the pre-roll. Run 'pnpm snapshots' and read the diff before committing it.`,
      });
    }
  }
  return findings;
}
