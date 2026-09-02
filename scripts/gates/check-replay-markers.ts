/**
 * Gate: every determinism-shaped test says whether it is part of the AT-04 proof.
 *
 * `pnpm replay-proof` selected its tests with `vitest run -t replay` until feature
 * 123's close-out. The generator's own byte-identity test — `AT-04 seed: two runs
 * from one root seed are byte-identical …`, inside `describe('the synthetic ocean
 * (feature 102)')` — contains "replay" in neither string, so the proof named that
 * test in its header and excluded it by its selector: seven ran, 623 were skipped,
 * and it printed *held* over the property the generator is most likely to lose.
 *
 * Selection is now by marker, which closes that. What a marker cannot close on its
 * own is the case that produced the fault in the first place: a byte-identity test
 * written without one sits outside the proof exactly as the generator's did, and
 * the proof still prints *held*. The marker set is a judgement, and a judgement no
 * artefact records is the thing this repository has twice paid for.
 *
 * So this gate refuses any test whose name reads as a determinism or replay claim
 * and carries neither marker. It is deliberately wider than the proof: a candidate
 * is a *name*, and the answer to "is this one of them?" is a decision somebody
 * writes down, not one this gate makes. Two answers are available —
 *
 *   AT-04: byte-identity        — in the proof; the proof runs it and requires a pass.
 *   AT-04: not byte-identity    — considered and excluded, with the reason beside it.
 *
 * The gate runs in `pnpm gates`, so it costs no test time and fires on every change.
 * Whether the marked tests actually *pass* is the proof's half, and `pnpm
 * replay-proof` is a separate CI step because it runs them.
 *
 * The empty-set floor lives in the proof, not here: a fixture tree with no
 * byte-identity tests is legitimate, whereas a proof asserting nothing is not.
 */
import { join, relative } from 'node:path';
import { walk, readLines, type Finding, REPO_ROOT } from './lib.js';

/** Carried on the line above a test that is part of the proof. */
export const MARKER = 'AT-04: byte-identity';
/** Carried on the line above a test that reads like one and is not, with why. */
export const EXCLUDED = 'AT-04: not byte-identity';
/** What counts as a candidate. Wider than the marked set, deliberately. */
export const CANDIDATE =
  /replay|byte[- ]identical|byte for byte|deterministic|determinism|same seed/i;

const IT = /\bit(?:\.\w+)?\(\s*(['"`])([\s\S]*?)\1/;

/** A test the proof expects to run: where it lives, and what it is called. */
export interface MarkedTest {
  readonly file: string;
  readonly name: string;
}

export interface Scan {
  /** Tests carrying the inclusion marker, with the name read from the line below it. */
  readonly marked: MarkedTest[];
  /** Markers whose following line is not an `it(` with a single-line name. */
  readonly unreadable: Finding[];
  /** Candidates carrying neither marker, so nobody has said which they are. */
  readonly unclassified: Finding[];
}

/**
 * Read the markers off the tree. Shared with `scripts/replay-proof.ts` rather than
 * written twice: the gate and the proof disagreeing about which tests are in the
 * proof is the same class of fault as the selector disagreeing with the header.
 */
export function scan(root: string = REPO_ROOT): Scan {
  const srcDir = join(root, 'app', 'src');
  const marked: MarkedTest[] = [];
  const unreadable: Finding[] = [];
  const unclassified: Finding[] = [];

  for (const file of walk(srcDir, (path) => /\.test\.tsx?$/.test(path))) {
    const lines = readLines(file);
    const where = relative(root, file);
    lines.forEach((line, index) => {
      if (line.includes(MARKER)) {
        const name = IT.exec(lines[index + 1] ?? '')?.[2];
        if (name === undefined) {
          unreadable.push({
            file: where,
            line: index + 2,
            message: `a "${MARKER}" marker is not directly above an it(...) with a single-line name, so the proof cannot say which test it expects`,
          });
        } else {
          marked.push({ file, name });
        }
        return;
      }
      const name = IT.exec(line)?.[2];
      if (name === undefined || !CANDIDATE.test(name)) return;
      const above = lines[index - 1] ?? '';
      if (!above.includes(MARKER) && !above.includes(EXCLUDED)) {
        unclassified.push({
          file: where,
          line: index + 1,
          message: `"${name}" reads as a determinism or replay claim and carries neither marker: put "${MARKER}" above it to put it in the AT-04 proof, or "${EXCLUDED}" with the reason it is not one`,
        });
      }
    });
  }

  return { marked, unreadable, unclassified };
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const { unreadable, unclassified } = scan(root);
  return [...unreadable, ...unclassified].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
}
