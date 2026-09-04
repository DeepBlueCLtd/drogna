/**
 * Gate: `CLAUDE.md`'s list of the capture proofs CI runs is the list CI runs.
 *
 * **This gate exists because that paragraph has now been wrong twice, about itself.** It was
 * written after a branch shipped seven consecutive red CI runs while `pnpm check` reported green
 * on every commit of it — the lesson being that `pnpm check` is not the build and the list of what
 * CI runs afterwards has to be somewhere a contributor can read. It then said "six capture proofs"
 * for the whole of feature 124, which had added a seventh one commit after that paragraph was
 * written. The correction added a sentence asking the next author to keep it in step.
 *
 * A sentence asking for something is not a check that it happened. `CLAUDE.md`'s own second
 * headline lesson is that a check which has never been seen to fail is worth nothing, and a rule
 * with nothing counting it is a weaker thing again: it has never been in a position to fail. The
 * mechanical version is this file. It reads the capture steps out of the workflow, reads the
 * backticked command names out of the paragraph, and fails on any difference in either direction
 * — a proof CI runs that the record does not name, and a proof the record names that CI does not
 * run.
 *
 * **The failure mode it catches is a contributor doing exactly as instructed.** `CLAUDE.md` tells
 * an author with a visible change to build and run "the others CI runs, listed above" before
 * pushing. Every proof missing from that list is one they will not run, and will meet as a red
 * CI run instead.
 *
 * The argument for the *counts* being checked too, and not only the names: the paragraph states
 * two numbers in prose — "CI runs N more things than it does" and "N capture proofs" — and a
 * number in prose beside a list is a second place for the same fact to be wrong. The first version
 * of this gate held the second number and not the first, and the first was wrong at the time it
 * was written.
 */
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { REPO_ROOT, type Finding } from './lib.js';

const RECORD = join('CLAUDE.md');
const WORKFLOW = join('.github', 'workflows', 'ci.yml');

/**
 * `run: pnpm run capture:glance operator` → `capture:glance`, and `run: pnpm capture:map` too.
 *
 * **Both spellings, and digits, because the first version of this regex had two blind spots and I
 * found them by planting three variants of one spelling.** `pnpm run x` was required, so a step
 * written `run: pnpm capture:widgets` — which is the form `CLAUDE.md`'s own commands table uses,
 * and therefore the one a contributor copies — added a proof the record did not name and the gate
 * reported clean. And `[a-z-]+` stopped at a digit, so `capture:consumers2` matched as
 * `capture:consumers`: a step running a script that does not exist passed both the name check and
 * the count. A gate whose own pattern is narrower than the thing it holds is the trap this gate
 * was written about, one level down.
 *
 * **And it stayed narrower twice.** Anchored on `run:` it could not see a step written as a
 * multi-line block —
 *
 * ```yaml
 * run: |
 *   pnpm run capture:alpha
 *   pnpm run capture:beta
 * ```
 *
 * — because `|` is not whitespace, nor `pnpm -C app run capture:gamma`, because `-C app` sits
 * between `pnpm` and `run`. Both are ordinary YAML and both would have added a proof the record
 * does not name while the gate reported clean. Anchored on `pnpm` and reading to the end of the
 * line, it sees every form of the command rather than the one form the workflow happens to use
 * today.
 */
const CI_STEP = /\bpnpm\b[^\n]*?\b(capture:[a-z0-9:_-]+)/g;
/** The backticked command names inside the sentence that lists them. */
const NAMED = /`(capture:[a-z0-9:_-]+?)(?:\s[^`]*)?`/g;
/** "seven capture proofs", so the prose count is held to the list beside it. */
const COUNTED = /\b([a-z]+)\s+capture proofs\b/;
/**
 * "CI runs seven more things than it does" — the *other* number in the same paragraph, four words
 * from the one above, and the one that was wrong when this gate was written to hold the other.
 *
 * It counts `replay-proof` and the captures together, so it is the capture count plus one. A
 * number in prose beside a list is a second place for the same fact to be wrong, which this gate's
 * own docstring says; there were two such numbers and it held one.
 */
const AFTER_THE_CHECKS = /CI runs ([a-z]+) more things than it does/;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function read(root: string, path: string): string {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    // A gate that cannot find what it holds has proved nothing and must not look like a pass.
    throw new Error(`${path} is not there to read — the gate has nothing to hold the record to`);
  }
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const workflow = read(root, WORKFLOW);
  const record = read(root, RECORD);

  // **Distinct proofs, not steps.** The record names *commands* and the workflow runs *steps*,
  // and one proof can be run twice — `capture:glance` already takes a view argument, and a second
  // `pnpm run capture:glance consumers` step is a plausible next change. Counting steps made an
  // honest record red: seven names against eight steps, fixable only by writing "eight" over a
  // list of seven or by backticking one command twice. The membership checks were always
  // set-shaped; the counts were not.
  // **Comment lines are not steps.** The pattern is deliberately wide — it has been too narrow
  // twice — but run over the whole file it also matched prose: this very workflow carries a
  // fifteen-line comment above the forecast step, and `CLAUDE.md` names capture commands in
  // sentences. A comment mentioning `pnpm run capture:widgets` produced three findings on a
  // correct tree, and the only way to green them was to write a lie into the record. Width where
  // the command may be written any way, and a skip where it is not a command at all.
  const steps = workflow
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  const ran = [...new Set([...steps.matchAll(CI_STEP)].map((match) => match[1]))];
  if (ran.length === 0) {
    throw new Error(`${WORKFLOW} runs no capture proof — the gate has nothing to hold the record to`);
  }

  // The sentence that names them, rather than every backtick in the file: `CLAUDE.md` mentions
  // individual capture commands elsewhere, and this gate is about the *inventory*.
  const sentence = /After the checks, CI runs[\s\S]*?\./.exec(record);
  if (!sentence) {
    throw new Error(`${RECORD} no longer carries the sentence listing what CI runs after the checks`);
  }
  const named = [...sentence[0].matchAll(NAMED)].map((match) => match[1]);
  const line = record.slice(0, sentence.index).split('\n').length;

  // A named proof that no script defines is a third way for the three to disagree, and the
  // cheapest to check: `package.json` is the only place a `pnpm run` name can come from.
  const manifest = read(root, join('package.json'));
  const defined = new Set(Object.keys((JSON.parse(manifest) as { scripts?: Record<string, string> }).scripts ?? {}));

  const findings: Finding[] = [];
  for (const proof of ran) {
    if (!defined.has(proof)) {
      findings.push({
        file: relative(root, join(root, WORKFLOW)),
        line: 1,
        message: `CI runs ${proof} and package.json defines no such script`,
      });
    }
  }
  for (const proof of ran) {
    if (!named.includes(proof)) {
      findings.push({
        file: relative(root, join(root, RECORD)),
        line,
        message: `CI runs ${proof} and this list does not name it; a contributor told to run "the others CI runs, listed above" will not run it`,
      });
    }
  }
  for (const proof of named) {
    if (!ran.includes(proof)) {
      findings.push({
        file: relative(root, join(root, RECORD)),
        line,
        message: `this list names ${proof} and ${WORKFLOW} does not run it`,
      });
    }
  }

  const total = AFTER_THE_CHECKS.exec(record);
  const totalStated = total ? NUMBER_WORDS.indexOf(total[1]) : -1;
  if (totalStated < 0) {
    findings.push({
      file: relative(root, join(root, RECORD)),
      line,
      message: 'the paragraph states no number of things CI runs after the checks',
    });
  } else if (totalStated !== ran.length + 1) {
    findings.push({
      file: relative(root, join(root, RECORD)),
      line,
      message: `the paragraph says CI runs ${total?.[1]} more things than \`pnpm check\`; it runs ${ran.length + 1} — ${ran.length} captures and replay-proof`,
    });
  }

  const counted = COUNTED.exec(sentence[0]);
  const stated = counted ? NUMBER_WORDS.indexOf(counted[1]) : -1;
  if (stated < 0) {
    findings.push({
      file: relative(root, join(root, RECORD)),
      line,
      message: 'the sentence states no number of capture proofs, so the count beside the list is unchecked',
    });
  } else if (stated !== ran.length) {
    findings.push({
      file: relative(root, join(root, RECORD)),
      line,
      message: `the sentence says ${counted?.[1]} capture proofs; CI runs ${ran.length}`,
    });
  }
  return findings;
}
