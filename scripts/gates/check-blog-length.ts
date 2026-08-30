/**
 * Gate: a blog entry is short (CLAUDE.md, "showing the work, not describing it").
 *
 * Nothing about the entries written so far was refused, and none of them was padded.
 * They ran long because the template asked for "two or three paragraphs" per part and
 * every author obliged: ten entries, 576 to 2,088 words, against a running instance one
 * click away that carries the weight the prose was carrying instead. An entry is an
 * invitation to the demo, and an invitation nobody finishes reading is a demo nobody
 * opens.
 *
 * So the budget is a check rather than a note, for the reason the note itself records:
 * the authoring note and the template have both said "terse" since before the first
 * entry existed, and every entry cleared the limit anyway. A length that is only advice
 * is advice read after the writing is done.
 *
 * The bound is read from `site/authoring/README.md` — the same table the author reads,
 * so the note cannot state one number while the build enforces another. A tree whose
 * note is missing or states no budget is a tree this gate cannot check, and it says so
 * rather than passing (run-gates.ts).
 *
 * What is counted is prose: everything after the front matter, with fenced code, HTML
 * comments and image alt text taken out, and a link counted by its text rather than its
 * URL. Alt text is exempt because the authoring note requires it to be long enough to
 * stand in for the picture — charging an entry for describing its own screenshot would
 * buy shorter alt text, which is the opposite of what is wanted.
 *
 * There is deliberately no exemption marker. An entry that genuinely needs more room is
 * two entries, or an entry whose middle belongs in an ADR; a marker would be spent the
 * first time an author was mid-flow and the budget would mean nothing again.
 */
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { walk, REPO_ROOT, type Finding } from './lib.js';

const NOTE = join('site', 'authoring', 'README.md');
const POSTS = join('site', 'docs', 'blog', 'posts');

interface Budget {
  readonly prose: number;
  readonly description: number;
}

/** The budget table in the authoring note: `| prose — ... | 300 |`. */
function budget(root: string): Budget {
  let note: string;
  try {
    note = readFileSync(join(root, NOTE), 'utf8');
  } catch {
    throw new Error(`${NOTE} is not there to read the word budget from — the gate has nothing to hold an entry to`);
  }
  const row = (label: string): number => {
    const match = new RegExp(String.raw`^\|\s*${label}\b[^|]*\|\s*(\d+)\s*\|`, 'm').exec(note);
    if (!match) {
      throw new Error(`${NOTE} states no '${label}' budget — the gate has nothing to hold an entry to`);
    }
    return Number(match[1]);
  };
  return { prose: row('prose'), description: row('description') };
}

/** Erased spans keep their newlines, so a finding still names the line it is on. */
const blanked = (span: string): string => span.replace(/[^\n]/g, '');

function countable(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, blanked)
    .replace(/<!--[\s\S]*?-->/g, blanked)
    .replace(/!\[[\s\S]*?\]\([\s\S]*?\)/g, blanked)
    .replace(/\[([\s\S]*?)\]\(([\s\S]*?)\)/g, (_whole, text: string, url: string) => text + blanked(url));
}

const WORDLIKE = /[A-Za-z0-9]/;

function words(line: string): number {
  return line
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>|~]/g, ' ')
    .split(/\s+/)
    .filter((token) => WORDLIKE.test(token)).length;
}

interface Entry {
  readonly description: string;
  readonly descriptionLine: number;
  readonly body: string;
  /** 1-based line of the body's first line, so findings point into the file. */
  readonly bodyLine: number;
}

function readEntry(source: string): Entry {
  const lines = source.split('\n');
  const close = lines[0]?.trim() === '---' ? lines.findIndex((line, index) => index > 0 && line.trim() === '---') : -1;
  if (close === -1) return { description: '', descriptionLine: 1, body: source, bodyLine: 1 };

  const front = lines.slice(1, close);
  const opens = front.findIndex((line) => /^description:/.test(line));
  let description = '';
  let descriptionLine = 1;
  if (opens !== -1) {
    descriptionLine = opens + 2;
    const rest: string[] = [front[opens]!.replace(/^description:\s*/, '').replace(/^[>|][-+]?\s*$/, '')];
    for (let index = opens + 1; index < front.length && /^\s/.test(front[index]!); index += 1) rest.push(front[index]!);
    description = rest.join(' ');
  }
  return { description, descriptionLine, body: lines.slice(close + 1).join('\n'), bodyLine: close + 2 };
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const bound = budget(root);
  const findings: Finding[] = [];
  for (const file of walk(join(root, POSTS), (path) => path.endsWith('.md'))) {
    const rel = relative(root, file);
    const entry = readEntry(readFileSync(file, 'utf8'));

    const described = words(countable(entry.description));
    if (described > bound.description) {
      findings.push({
        file: rel,
        line: entry.descriptionLine,
        message: `the description runs to ${described} words; the index card takes ${bound.description} (site/authoring/README.md)`,
      });
    }

    const lines = countable(entry.body).split('\n');
    let running = 0;
    let overflowed = -1;
    lines.forEach((line, index) => {
      running += words(line);
      if (overflowed === -1 && running > bound.prose) overflowed = index;
    });
    if (running > bound.prose) {
      findings.push({
        file: rel,
        line: entry.bodyLine + overflowed,
        message: `the entry runs to ${running} words of prose; the budget is ${bound.prose} and it is spent here — the demo carries the rest (site/authoring/README.md)`,
      });
    }
  }
  return findings;
}
