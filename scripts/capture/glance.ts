/**
 * The glance (SRD-v2 FR-19): a headless-Chromium screenshot of the running shell.
 *
 * It serves the committed static build read-only on an ephemeral local port (V2 has
 * no separately running stack to attach to — the page IS the system), pins the clock
 * rate to zero for the duration through the shell's own seam endpoint, and prints
 * the simulated rate in force beside the image path — so a picture of a stopped
 * system is never handed over as a live one.
 *
 * Usage: pnpm capture:glance [view-id] [out.png]
 * The optional view id deep-links the capture (FR-15): e.g. `system`, `messages`.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
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
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(outPath);
  console.log(`simulated rate in force: ${rateText ?? 'unknown'} (pinned for capture); sim time ${simTime ?? 'unknown'}`);
} finally {
  await browser.close();
  server.close();
}
