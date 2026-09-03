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
import { walk, readLines, isCommentLine, type Finding, REPO_ROOT } from './lib.js';

/** Carried on the line above a test that is part of the proof, or trailing it. */
export const MARKER = 'AT-04: byte-identity';
/** Carried the same way on a test that reads like one and is not, with why. */
const EXCLUDED = 'AT-04: not byte-identity';
/** What counts as a candidate. Wider than the marked set, deliberately. */
const CANDIDATE =
  /replay|byte[- ]identical|byte for byte|deterministic|determinism|same seed/i;

/**
 * `it` or `test`, either bare or with a modifier, and the name that follows.
 *
 * Both spellings, because vitest exports both and a sweep that knew only `it`
 * would be blind to `test('replays byte-identically …')` — silently, which is the
 * direction that matters: a *marker* above an unrecognised form is reported, but a
 * missing marker on one is not, and the missing marker is the case the sweep is for.
 */
const DECLARATION = /\b(?:it|test)(?:\.\w+)?\s*\(/;
const NAME = /^\s*\(?\s*(['"`])([\s\S]*?)\1/;

/** A test the proof expects to run: where it lives, and what it is called. */
export interface MarkedTest {
  /** Absolute, because vitest is invoked with it. `Finding.file` is repo-relative. */
  readonly absolutePath: string;
  readonly name: string;
}

export interface Scan {
  readonly marked: MarkedTest[];
  readonly unreadable: Finding[];
  readonly unclassified: Finding[];
}

/**
 * The name a declaration gives its test, or undefined when it does not give one on
 * a line this can read. Looks past the end of the line, because
 * `it(\n  'name',\n  fn)` is ordinary formatting and a per-line regex would not see
 * it — the third silent blindness the first version of this gate had.
 */
function declaredName(lines: string[], index: number): string | undefined {
  const line = lines[index] ?? '';
  const match = DECLARATION.exec(line);
  if (!match) return undefined;
  // The name is whatever follows the opening bracket, on this line or the next few.
  // Three lines is enough for every formatting in the tree and stops the lookahead
  // from wandering into an unrelated string further down the body.
  const rest = [line.slice(match.index + match[0].length), ...lines.slice(index + 1, index + 3)]
    .join('\n')
    .replace(/^\s*/, '');
  return NAME.exec(rest)?.[2];
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

  for (const absolutePath of walk(srcDir, (path) => /\.test\.tsx?$/.test(path))) {
    const lines = readLines(absolutePath);
    const file = relative(root, absolutePath);
    const seen = new Set<string>();

    lines.forEach((line, index) => {
      // A marker marks the test on its own line when it trails one, and otherwise
      // the test on the line below. Reading only below meant a trailing marker
      // marked the *next* test and dropped its own from the sweep — the original
      // fault's exact shape, reintroduced by the fix for it.
      const marksHere = line.includes(MARKER);
      const marksBelow = (lines[index - 1] ?? '').includes(MARKER);
      const excluded = line.includes(EXCLUDED) || (lines[index - 1] ?? '').includes(EXCLUDED);
      const name = declaredName(lines, index);

      if (marksHere && name === undefined) {
        // A marker on a line that declares nothing must be directly above one.
        if (declaredName(lines, index + 1) === undefined) {
          unreadable.push({
            file,
            line: index + 2,
            message: `a "${MARKER}" marker is neither on nor directly above a test declaration this can name, so the proof cannot say which test it expects`,
          });
        }
        return;
      }
      if (name === undefined) return;

      if (marksHere || marksBelow) {
        if (seen.has(name)) {
          // Two marked tests with one name in one file: the proof keys passes by
          // (file, name), so one passing could stand in for the other being skipped.
          unreadable.push({
            file,
            line: index + 1,
            message: `two marked tests in this file are both called "${name}", so a pass for one cannot be told from a skip of the other`,
          });
          return;
        }
        seen.add(name);
        marked.push({ absolutePath, name });
        return;
      }

      // The sweep. Prose that quotes a test name is prose about the rule, not a
      // test: this file's own header quotes one, and so do several in app/src.
      if (isCommentLine(line) || !CANDIDATE.test(name) || excluded) return;
      unclassified.push({
        file,
        line: index + 1,
        message: `"${name}" reads as a determinism or replay claim and carries neither marker: put "${MARKER}" on or above it to put it in the AT-04 proof, or "${EXCLUDED}" with the reason it is not one`,
      });
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
