/**
 * The forecast tab's centre region, with a water column open and its rays drawn
 * (feature 124).
 *
 * **Why this is not `capture:glance`.** Glance pins the clock and shoots the view as it opens.
 * Everything this region draws arrives after an analysis cycle has published *and* a reader has
 * picked a column: with the clock stopped there is no cycle, and with no pick there are no rays,
 * no profile and no numbers. A glance of this view is a picture of an empty region, which is the
 * blindness `CLAUDE.md` records `capture:mobile` having had — "a capture proof measures a
 * stopped harness" — and the reason a gauge that had overflowed its box since the day it was
 * written survived every run of that proof.
 *
 * **And why not `capture:motion`.** Motion is the right tool for the thing that moves here — a
 * level chosen, the rays re-weighting — and it does record across a click. It clicks *one*
 * selector, though, and this surface needs two: a cell picked to open a column, then a level
 * chosen to re-weight it. Rather than teach a shared script a second act for one caller, this
 * takes the still, and the entry's alt text carries the reading. If a second caller ever wants a
 * two-act recording, that is the moment to add it to `motion.ts` rather than now.
 *
 * **The column is not chosen here.** It is read off the served contributions header, so the
 * picture is of a column an instrument actually reached rather than of whichever cell this file
 * liked the look of — which, sampled blindly on the loitering start, is open water and draws
 * nothing.
 *
 * Usage:
 *   pnpm capture:forecast [out.png]
 * Environment:
 *   DROGNA_FORECAST_START   the start condition to open (default: the configured default)
 *   DROGNA_FORECAST_WIDTH   viewport width (default 2560; see the note on `width`)
 *   DROGNA_FORECAST_CYCLES  analysis cycles to warm through (default 3)
 *   DROGNA_FORECAST_CAPTION the sidecar's caption
 */
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import runConfigDocument from '../../app/config/run.json' with { type: 'json' };
import type { ConfigRun } from '../../app/src/generated/types.js';

const config = runConfigDocument as ConfigRun;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outPath = process.argv[2] ?? join(repoRoot, '.capture', 'forecast-column.png');
const startCondition = process.env.DROGNA_FORECAST_START ?? config.start_conditions.default;
/**
 * Wide, and for a stated reason: the centre region is one column of a three-column layout, so
 * the viewport width is what the FR-130 numbers table gets. At 1280 the region is 388 px and the
 * table — six sources against contribution, separation, declared error and background error —
 * scrolls inside its own box with the separation column cut mid-value. The entry's requirement
 * paragraph promises exactly those two errors, so an artefact that clips them is evidence for a
 * claim it does not contain. At 2560 the region is 815 px and the table fits whole. How the same
 * region behaves at a phone's width is `capture:mobile`'s question and not this one's.
 */
const width = Number(process.env.DROGNA_FORECAST_WIDTH ?? 2560);
/**
 * How many analysis cycles to warm through before the shutter. Three rather than one: the
 * measurement footprint on the first cycle is a single cell's worth and the share map has almost
 * nothing in it to point at. Stated here and in the sidecar, because "warmed until it looked
 * right" is not a reproducible instruction.
 */
const cycles = Number(process.env.DROGNA_FORECAST_CYCLES ?? 3);
const height = 1000;

/**
 * A PNG's own width and height, from the IHDR chunk: eight bytes of signature, four of length,
 * four of type, then two big-endian 32-bit integers. Eleven lines rather than a dependency, and
 * the point is that the sidecar's dimensions come from the bytes that were written.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('the capture is not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.snapshot': 'application/octet-stream',
  '.woff2': 'font/woff2',
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

const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  // **One navigation, carrying both the start condition and the view.** This was two: a first
  // goto with `?start=` and a second with the hash alone. The second dropped the query, which
  // makes it a full reload onto the *default* condition — so `DROGNA_FORECAST_START` did
  // nothing, and the evaluate that followed ran against a shell that had not finished
  // provisioning a run and was answering 503. `capture:glance` has always done it in one.
  await page.goto(`${base}?start=${startCondition}#/view/forecast`);
  await page.getByTestId('sim-time').waitFor({ timeout: 60_000 });

  // Warmed through the shell's own step endpoint, in bursts, until an analysis cycle has
  // published — the clock is pinned to rate 0 first, so nothing here reads host time and the
  // picture is of a stated simulated instant (Principle I).
  //
  // **Every response is read, and the burst size comes from the configuration.** The first
  // version sent `ticks: 120` and checked nothing. `operator.step.maximum_ticks` is 60, so the
  // plane refused all sixty bursts — "120 ticks is beyond the declared bound of 60" — and the
  // loop advanced the simulation by nothing at all. What made the picture was the pre-roll
  // running on at the configured rate while Playwright worked, which is exactly the host-time
  // dependence the docstring above claims is absent: the sidecar recorded `rate 1` and a
  // `sim_time` 22 seconds past the pre-roll's end. A refusal is now a thrown error rather than
  // a silent no-op, and the bound is read from the same document the plane reads it from
  // (Constitution IV).
  const stepTicks = config.operator.step.maximum_ticks;
  const pinned = await page.evaluate(async () => {
    const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: 0 }) });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
  if (!pinned.ok) throw new Error(`the clock would not pin: ${pinned.status} ${pinned.body}`);
  await page.waitForFunction(
    () => /rate 0/.test(document.querySelector('[data-testid="sim-rate"]')?.textContent ?? ''),
    { timeout: 30_000 },
  );

  // **The loop stops on a fact about the store, not on a class appearing in the document.** Its
  // first working version asked `document.querySelector('.forecast-share-map')` after each burst
  // and never once saw it — the shell's render is scheduled on a macrotask the evaluate's own
  // await chain does not reliably yield to — so it ran its whole budget every time and the
  // sidecar said "until an analysis cycle published" about a fixed number of ticks. Stepping a
  // fixed count would at least have been honest; asking the coverage store how many
  // contributions holdings it has is both, and it is the same question the picker below asks.
  const warmed = await page.evaluate(
    async ({ ticks, cycles, budget }: { ticks: number; cycles: number; budget: number }) => {
      let seen = 0;
      let burst = 0;
      for (; burst < budget; burst++) {
        const inventory = await (await fetch('/api/ctl/holdings')).json();
        seen = inventory.holdings.filter(
          (holding: { field: { format: string } }) => holding.field.format === 'drogna-contributions-v1',
        ).length;
        if (seen >= cycles) break;
        const response = await fetch('/api/ctl/clock/step', { method: 'POST', body: JSON.stringify({ ticks }) });
        if (!response.ok) return { bursts: burst, cycles: 0, refused: `${response.status} ${await response.text()}` };
      }
      return { bursts: burst, cycles: seen, refused: '' };
    },
    { ticks: stepTicks, cycles, budget: 600 },
  );
  if (warmed.refused) throw new Error(`the step endpoint refused: ${warmed.refused}`);
  if (warmed.cycles < cycles) {
    throw new Error(`only ${warmed.cycles} of ${cycles} analysis cycles published within the step budget`);
  }
  await page.waitForSelector('.forecast-share-map', { timeout: 60_000 });

  const picked = await page.evaluate(async (prefix: string) => {
    const inventory = await (await fetch('/api/ctl/holdings')).json();
    const holdings = inventory.holdings.filter(
      (holding: { field: { format: string } }) => holding.field.format === 'drogna-contributions-v1',
    );
    // The standing cycle, which is the one the panel draws: a start condition pre-rolls several.
    const holding = holdings[holdings.length - 1];
    if (!holding) return { rays: 0, holding: 'none', why: 'no contributions holding was published' };
    const header = await (await fetch(`${prefix}/${holding.holding_id}`)).json();
    if (!header.sources?.length) return { rays: 0, holding: holding.holding_id, why: 'the cycle assimilated nothing' };
    const want = header.sources[0].cell;
    let nearest: SVGRectElement | undefined;
    let best = Infinity;
    for (const node of document.querySelectorAll('rect.share-cell')) {
      const cell = node as SVGRectElement;
      const distance = Math.hypot(
        Number(cell.getAttribute('data-lon')) - want.longitude,
        Number(cell.getAttribute('data-lat')) - want.latitude,
      );
      if (distance < best) {
        best = distance;
        nearest = cell;
      }
    }
    nearest?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((settled) => setTimeout(settled, 800));
    return {
      rays: document.querySelectorAll('line.forecast-ray').length,
      holding: holding.holding_id,
      why: 'picked from the served header',
    };
  }, config.shell.endpoints.contributions);

  if (picked.rays === 0) {
    throw new Error(`no column drew a ray (${picked.why}); the picture would show an empty region`);
  }

  const region = await page.$('.forecast-column');
  if (!region) throw new Error('the centre region is not on the page');

  // **The viewport is grown to the region before the shutter.** The first committed artefact was
  // 390x1593 with its last 659 rows a single flat `--shell-bg`: the region is taller than a
  // 1000 px viewport, and what was below the fold — the 800 m and 1000 m profile rows and the
  // whole of the FR-130 numbers table — was not in the picture at all. The blog entry's
  // requirement paragraph promises exactly the part that was missing, and its only evidence did
  // not contain it. Measured, resized, measured again; and the shot is refused rather than
  // truncated if the region still will not fit.
  const first = await region.boundingBox();
  if (!first) throw new Error('the centre region has no box to measure');
  const shotHeight = Math.ceil(first.height) + 40;
  await page.setViewportSize({ width, height: shotHeight });
  await page.waitForFunction(
    (wanted: number) => (document.querySelector('.forecast-column')?.getBoundingClientRect().height ?? 0) <= wanted,
    shotHeight,
    { timeout: 30_000 },
  );
  const box = await region.boundingBox();
  if (!box) throw new Error('the centre region has no box to measure');
  if (box.height > shotHeight) {
    throw new Error(`the region is ${Math.round(box.height)}px tall in a ${shotHeight}px viewport; it would be clipped`);
  }

  // The clock is asserted still stopped at the shutter rather than assumed: the resize above
  // gives the shell a frame to react in, and a picture whose sidecar says `rate 0` has to have
  // been taken at rate 0.
  const rateAtShutter = (await page.getByTestId('sim-rate').textContent()) ?? '';
  if (!/rate 0/.test(rateAtShutter)) throw new Error(`the clock was running at the shutter: ${rateAtShutter}`);

  mkdirSync(dirname(outPath), { recursive: true });
  await region.screenshot({ path: outPath });

  const simTime = await page.getByTestId('sim-time').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const provenance = {
    image: basename(outPath),
    run_id: runId ?? 'unknown',
    view: 'forecast',
    start_condition: startCondition,
    sim_time: simTime ?? 'unknown',
    clock_pinned: rateAtShutter,
    holding: picked.holding,
    rays_drawn: picked.rays,
    column: 'read off the served contributions header, so it is a column an instrument reached',
    warmed: `stepped in bursts of ${stepTicks} ticks at rate 0 until ${cycles} analysis cycles had published (${warmed.bursts} bursts)`,
    viewport: { width, height: shotHeight },
    // **Read out of the file's own header, not off the element's box.** These disagreed —
    // 388x1592 recorded for a 390x1593 file — because the box is CSS pixels before rounding and
    // the shot is device pixels after it. A sidecar's whole job is to describe the artefact
    // beside it, so it reads the artefact.
    image_size: pngSize(await readFile(outPath)),
    element_box: { width: Math.round(box.width), height: Math.round(box.height) },
    browser: { name: 'chromium', version: browser.version() },
    caption: process.env.DROGNA_FORECAST_CAPTION ?? '',
  };
  await writeFile(outPath.replace(/\.png$/, '.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(outPath);
  console.log(`forecast: ${picked.rays} ray(s) drawn from ${picked.holding}; sim time ${simTime ?? 'unknown'}`);
} finally {
  await browser.close();
  server.close();
}
