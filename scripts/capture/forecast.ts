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
 *   DROGNA_FORECAST_WIDTH   viewport width (default 1280)
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
const width = Number(process.env.DROGNA_FORECAST_WIDTH ?? 1280);
const height = 1000;

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
  await page.goto(`${base}?start=${startCondition}`);
  await page.getByTestId('sim-time').waitFor({ timeout: 60_000 });
  await page.goto(`${base}#/view/forecast`);

  // Warmed through the shell's own step endpoint, in bursts, until an analysis cycle has
  // published — the clock is pinned to rate 0 throughout, so nothing here reads host time and
  // the picture is of a stated simulated instant (Principle I).
  await page.evaluate(async () => {
    await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: 0 }) });
    for (let burst = 0; burst < 60; burst++) {
      await fetch('/api/ctl/clock/step', { method: 'POST', body: JSON.stringify({ ticks: 120 }) });
      if (document.querySelector('.forecast-share-map')) return;
    }
  });
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
  mkdirSync(dirname(outPath), { recursive: true });
  await region.screenshot({ path: outPath });
  const box = await region.boundingBox();

  const rateText = await page.getByTestId('sim-rate').textContent();
  const simTime = await page.getByTestId('sim-time').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const provenance = {
    image: basename(outPath),
    run_id: runId ?? 'unknown',
    view: 'forecast',
    sim_time: simTime ?? 'unknown',
    clock_pinned: rateText ?? 'unknown',
    holding: picked.holding,
    rays_drawn: picked.rays,
    column: 'read off the served contributions header, so it is a column an instrument reached',
    warmed: 'stepped in bursts of 120 ticks at rate 0 until an analysis cycle published',
    viewport: { width, height },
    // The element, not the page: this is a region shot, and the two differ.
    image_size: box ? { width: Math.round(box.width), height: Math.round(box.height) } : 'unknown',
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
