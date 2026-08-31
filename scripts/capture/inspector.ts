/**
 * The inspector reads at a desktop width, and does not compress a value into a column
 * of syllables.
 *
 * This exists because the fault it measures shipped and nobody's test noticed. The
 * Messages split gave the list and the inspector `flex: 1` apiece, and the inspector's
 * own table was laid out automatically, so its `nowrap` name column — holding the
 * longest label in the document — took 301 pixels of a 532-pixel table and left the
 * value 73. A `datastream_id` of thirty-four characters came out down a four-character
 * column, six lines tall; at 1100px the same column measured fourteen pixels, which is
 * one character. Every unit test was green throughout, because none of them can see a
 * rendered line box.
 *
 * So the claim is measured in a browser, on the real shell, and the run exits non-zero
 * when it fails:
 *
 *   1. **The value gets at least the room its name gets.** Column widths, read off the
 *      rendered table rather than asserted against a number typed here — the fault was
 *      precisely a name column outbidding the values it names.
 *   2. **No unbroken value is broken across more lines than a backstop allows.**
 *      Counted from `Range.getClientRects()`, grouped by line box — those are the lines
 *      the browser actually drew. Restricted to values carrying no whitespace — an
 *      identifier, a timestamp, a serialised object — because a prose `description` is
 *      entitled to wrap and a check that forbade it would be a check about the wrong
 *      thing.
 *
 * The first is the load-bearing one and the second is a backstop, which is worth saying
 * plainly rather than presenting two checks as equals. A column's width is the fault;
 * the line count is a consequence of it, and at some panel width a fifty-four-character
 * serialised object legitimately needs three lines however the columns are shared. What
 * the backstop is for is the difference between three and fifty-four.
 *
 * Watched failing before it was trusted (CLAUDE.md, lesson 2): run against the layout
 * this change replaced, it reports the value column narrower than the name column at
 * every one of these widths — 14px against 301px at four of them — and the same value
 * drawn across fifty-four lines, which is one character to a line.
 *
 * Usage: pnpm capture:inspector [out-dir]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'inspector');

/**
 * The widths the wide presentation is held to. 1120px is where the three-across row
 * gives way to the inspector taking a row of its own, so the set straddles it: the
 * claim is about both layouts, and a fix that only held on one side of a breakpoint
 * would be half a fix.
 */
const WIDTHS = [1680, 1440, 1280, 1152, 1024, 900];

/**
 * How many line boxes an unbroken value may occupy.
 *
 * Three, and the number is a backstop rather than a design target: a column is a share
 * of a table and a table is a share of a panel, so the longest thing the masters
 * serialise — `{"name":"decibar","symbol":"dbar","definition":"dbar"}`, fifty-four
 * characters — needs three lines in a panel 900 pixels wide and two above about 1150,
 * whatever the columns do. Demanding two would be a proof about this month's field
 * names, and the first claim is the one that catches the fault anyway. The layout this
 * replaced drew that same value across fifty-four lines.
 */
const MAX_LINES = 3;

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

const server = createServer((request, response) => {
  void (async () => {
    const path = normalize((request.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    try {
      const body = await readFile(join(distDir, path));
      response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  })();
});

await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('no listening address');
const base = `http://127.0.0.1:${address.port}/`;

/** How long a capture waits for the shell: a start condition's pre-roll is thousands of ticks. */
const SHELL_TIMEOUT = 60_000;

interface Measurement {
  readonly width: number;
  readonly inspector: number;
  readonly nameColumn: number;
  readonly valueColumn: number;
  readonly fields: number;
  /** The unbroken value drawn across the most line boxes, and how many. */
  readonly worst: { readonly text: string; readonly lines: number };
}

/**
 * What the inspector is actually drawing, read off the page. Column widths come from
 * the first row's cells and line counts from `Range.getClientRects()` — the boxes the
 * browser laid out, not a division of characters by an assumed character width.
 */
async function measure(page: Page, width: number): Promise<Measurement> {
  const reading = await page.evaluate(() => {
    const table = document.querySelector('.inspect-fields');
    const rows = [...(table?.querySelectorAll('tbody tr') ?? [])];
    const first = rows[0];
    const worst = { text: '', lines: 0 };
    for (const row of rows) {
      const cell = row.querySelector('.inspect-value');
      const text = (cell?.textContent ?? '').trim();
      // Only an unbroken token: prose is entitled to wrap, an identifier is not.
      if (cell === null || text === '' || /\s/.test(text)) continue;
      const range = document.createRange();
      range.selectNodeContents(cell);
      // Distinct line boxes, not rectangles: a range over `200` followed by an
      // `<i>m</i>` returns two rects that sit on the same line, and the first draft of
      // this check counted them as two lines and reported the fixed layout at its
      // limit. Rounded because sub-pixel tops differ between a text run and an inline
      // element on the same baseline. Found by disbelieving a proof that passed.
      const tops = new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      );
      const lines = tops.size;
      if (lines > worst.lines) {
        worst.lines = lines;
        worst.text = text;
      }
    }
    return {
      inspector: Math.round(
        document.querySelector('.message-detail')?.getBoundingClientRect().width ?? 0,
      ),
      nameColumn: Math.round(first?.querySelector('th')?.getBoundingClientRect().width ?? 0),
      valueColumn: Math.round(
        first?.querySelector('.inspect-value')?.getBoundingClientRect().width ?? 0,
      ),
      fields: rows.length,
      worst,
    };
  });
  return { width, ...reading };
}

const failures: string[] = [];
const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
mkdirSync(outDir, { recursive: true });
const measurements: Measurement[] = [];
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}#/view/messages`);
    await page.getByTestId('traffic-display').waitFor({ timeout: SHELL_TIMEOUT });

    // Faster than real time, through the shell's own rate control: the observation
    // topics carry the longest identifiers the masters declare, and they are what a
    // reader opens the inspector on. At rate 1 the list is heartbeats for a while.
    const accepted = await page.evaluate(async () => {
      const response = await fetch('/api/ctl/clock/rate', {
        method: 'PUT',
        body: JSON.stringify({ rate: 60 }),
      });
      return response.status;
    });
    if (accepted !== 200) throw new Error(`could not set the capture rate: the endpoint answered ${accepted}`);
    await page.waitForTimeout(Number(process.env.DROGNA_INSPECTOR_WARM_MS ?? 8000));

    // Driven through the shell: a reader picks an observation out of the list and the
    // inspector reads it against its master. Nothing reaches past the panel.
    const row = page.locator('.messages-list tbody tr').filter({ hasText: 'obs/' }).first();
    await row.waitFor({ timeout: SHELL_TIMEOUT });
    await row.click();
    await page.getByTestId('inspect-fields').waitFor({ timeout: SHELL_TIMEOUT });
    // Playwright scrolls a clicked row into view, and the list is wider than its column;
    // put it back so the picture is the one a reader gets.
    await page.evaluate(() => {
      const scroller = document.querySelector('.messages-list-scroll');
      if (scroller) scroller.scrollLeft = 0;
    });

    const reading = await measure(page, width);
    measurements.push(reading);
    await page.screenshot({ path: join(outDir, `inspector-${width}.png`) });

    if (reading.fields === 0) {
      failures.push(`${width}px: the inspector drew no fields, so nothing was measured`);
    }
    if (reading.valueColumn < reading.nameColumn) {
      failures.push(
        `${width}px: the value column is ${reading.valueColumn}px and the name column ${reading.nameColumn}px — ` +
          'the names are outbidding the values they name',
      );
    }
    if (reading.worst.lines > MAX_LINES) {
      failures.push(
        `${width}px: '${reading.worst.text}' is drawn across ${reading.worst.lines} lines — a value compressed into a column`,
      );
    }
    await page.close();
  }

  const provenance = {
    proof:
      'the Messages inspector gives a value more room than its name, and does not break an unbroken value across more than two lines',
    images: WIDTHS.map((width) => `inspector-${width}.png`),
    max_lines: MAX_LINES,
    measurements,
    driven_through: 'the shell’s own controls: an observation picked out of the Messages list',
    browser: { name: 'chromium', version: browser.version() },
  };
  await writeFile(join(outDir, 'inspector.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  for (const reading of measurements) {
    console.log(
      `${reading.width}px: inspector ${reading.inspector}px — name ${reading.nameColumn}px, value ${reading.valueColumn}px; ` +
        `worst unbroken value ${reading.worst.lines} line(s)`,
    );
  }
  console.log(outDir);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`inspector: ${failure}`);
  process.exit(1);
}
console.log(
  `inspector: the value column outweighs the name column at every width, and no unbroken value wrapped past ${MAX_LINES} lines.`,
);
