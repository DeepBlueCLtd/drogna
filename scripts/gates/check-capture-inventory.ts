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
 * The argument for the *count* being checked too, and not only the names: the paragraph states a
 * number in prose ("seven capture proofs"), and a number in prose beside a list is a second place
 * for the same fact to be wrong.
 */
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { REPO_ROOT, type Finding } from './lib.js';

const RECORD = join('CLAUDE.md');
const WORKFLOW = join('.github', 'workflows', 'ci.yml');

/** `run: pnpm run capture:glance operator` → `capture:glance`. */
const CI_STEP = /run:\s*pnpm\s+run\s+(capture:[a-z-]+)/g;
/** The backticked command names inside the sentence that lists them. */
const NAMED = /`(capture:[a-z-]+)[^`]*`/g;
/** "seven capture proofs", so the prose count is held to the list beside it. */
const COUNTED = /\b([a-z]+)\s+capture proofs\b/;
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

  const ran = [...workflow.matchAll(CI_STEP)].map((match) => match[1]);
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

  const findings: Finding[] = [];
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
