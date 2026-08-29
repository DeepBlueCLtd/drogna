/**
 * The glance (SRD-v2 FR-19): a headless-Chromium screenshot of the running shell.
 *
 * It serves the committed static build read-only on an ephemeral local port (V2 has
 * no separately running stack to attach to — the page IS the system), pins the clock
 * rate to zero for the duration through the shell's own seam endpoint, and prints
 * the simulated rate in force beside the image path — so a picture of a stopped
 * system is never handed over as a live one.
 *
 * Beside each image it writes a `.provenance.json` sidecar: the run the picture came
 * from, the instant and rate the clock was at, the viewport and the browser. The site's
 * authoring rules have required that sidecar since the V1 site, and OCR over published
 * images is the check V2 gave up (ADR-0031) — the discipline it was traded for is this
 * one, so the mechanism writes the record rather than asking an author to remember.
 *
 * Usage: pnpm capture:glance [view-id] [out.png]
 * The optional view id deep-links the capture (FR-15): e.g. `system`, `messages`.
 * DROGNA_GLANCE_CAPTION, if set, is recorded in the sidecar as the picture's caption.
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const viewId = process.argv[2];
const outPath = process.argv[3] ?? join(repoRoot, '.capture', `glance-${viewId ?? 'default'}.png`);

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

// A container that carries its own Chromium names it here rather than downloading
// another; CI installs the version Playwright pins and leaves this unset.
const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(viewId ? `${base}#/view/${viewId}` : base);
  await page.getByTestId('sim-time').waitFor({ timeout: 10_000 });

  // Optionally let the run get somewhere first. A harness photographed at its
  // epoch shows an honest empty board, which is the right picture for the shell
  // arriving and the wrong one for anything the loop has to produce. The rate and
  // the warming are both recorded in the sidecar, and the clock is pinned to zero
  // for the capture itself either way (FR-19).
  const warmRate = Number(process.env.DROGNA_GLANCE_WARM_RATE ?? 0);
  const warmMillis = Number(process.env.DROGNA_GLANCE_WARM_MS ?? 0);
  if (warmRate > 0 && warmMillis > 0) {
    const accepted = await page.evaluate(async (rate) => {
      const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate }) });
      return response.status;
    }, warmRate);
    if (accepted !== 200) throw new Error(`could not set the warming rate: rate endpoint answered ${accepted}`);
    await page.waitForTimeout(warmMillis);
  }

  // Pin the clock for the capture, through the shell's own seam: rate zero is a
  // legitimate rate (FR-19), and the acknowledgement sample updates the display.
  const pinned = await page.evaluate(async () => {
    const response = await fetch('/api/ctl/clock/rate', {
      method: 'PUT',
      body: JSON.stringify({ rate: 0 }),
    });
    return response.status;
  });
  if (pinned !== 200) throw new Error(`could not pin the clock: rate endpoint answered ${pinned}`);
  await page.waitForFunction(() => {
    const rate = document.querySelector('[data-testid="sim-rate"]');
    return rate?.textContent?.includes('rate 0') ?? false;
  });

  // Let one full heartbeat cadence pass before looking: liveness is real time
  // (ADR-0006), so a shot taken inside the first interval shows an honest dark
  // board — true, but not the moment worth capturing.
  await page.waitForTimeout(Number(process.env.DROGNA_GLANCE_SETTLE_MS ?? 2500));

  const rateText = await page.getByTestId('sim-rate').textContent();
  const simTime = await page.getByTestId('sim-time').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const litComponents = await page.evaluate(() =>
    [...document.querySelectorAll('[data-component]')]
      .filter((row) => !row.className.includes('dark'))
      .map((row) => row.getAttribute('data-component') ?? ''),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  // The sidecar: what a reader would otherwise have to take on trust about the
  // picture. The run id is recorded rather than the seed, because a fresh visit
  // seeds itself and the id is what that seed produced — the identifier that
  // actually names this run (a manifest import reproduces it).
  const provenance = {
    image: basename(outPath),
    run_id: runId ?? 'unknown',
    view: viewId ?? 'first configured view',
    sim_time: simTime ?? 'unknown',
    clock_pinned: rateText ?? 'unknown',
    lit_components: litComponents.length > 0 ? litComponents : 'not readable from this view',
    warmed:
      warmRate > 0 && warmMillis > 0
        ? `run at rate ${warmRate} for ${warmMillis} ms of host time before the clock was pinned`
        : 'not warmed: the picture is of the run at its epoch',
    viewport: { width: 1440, height: 900 },
    browser: { name: 'chromium', version: browser.version() },
    caption: process.env.DROGNA_GLANCE_CAPTION ?? '',
  };
  await writeFile(outPath.replace(/\.png$/, '.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(outPath);
  console.log(`simulated rate in force: ${rateText ?? 'unknown'} (pinned for capture); sim time ${simTime ?? 'unknown'}`);
} finally {
  await browser.close();
  server.close();
}
