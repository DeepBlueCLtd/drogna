/**
 * SC-07, watched happening (feature 114 T032).
 *
 * The claim: *the ownship track appears in all three projections, and the volume's track
 * is drawn at the depths the platform reported rather than at the surface.*
 *
 * Before feature 114 the depth volume drew neither the track nor the demanded course.
 * That was not a decision — `MapPanel` selects `cubeLayers` or `geographicLayers` whole,
 * and the ownship layers existed only in the second — which is exactly the kind of gap
 * that a screenshot of the map at its default projection would never have shown. So the
 * proof drives all three.
 *
 * **It is a proof, not a picture.** Each projection is selected through the panel's own
 * control, the layers it actually handed deck.gl are read off `data-map-layers`, and the
 * run exits non-zero when a projection drew no track. The images are written because a
 * reader of the pull request should be able to see it; the exit code is what makes it a
 * check.
 *
 * The second half of the claim — *at reported depths, not at the surface* — cannot be
 * read off a canvas, and is not asserted here. It is asserted where it can be: over the
 * cartesian coordinates the frame produces, in `app/src/panels/map/cube.test.ts`. A
 * capture that claimed to have verified it by looking would be a capture claiming more
 * than it saw.
 *
 * Usage: pnpm capture:map [out-dir]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'map');

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

const PROJECTIONS = [
  { value: 'flat', name: 'plan' },
  { value: 'globe', name: 'globe' },
  { value: 'cube', name: 'volume' },
] as const;

const failures: string[] = [];
const drawn: Record<string, string[]> = {};
const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
mkdirSync(outDir, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}#/view/map`);
  await page.getByTestId('sim-time').waitFor({ timeout: 20_000 });
  await page.getByTestId('ownship-status').waitFor({ timeout: 30_000 });

  // Run the world forward so the platform has genuinely reported positions to draw: an
  // empty track in every projection would satisfy a check that only compared them.
  const rate = Number(process.env.DROGNA_MAP_RATE ?? 60);
  const accepted = await page.evaluate(async (value) => {
    const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: value }) });
    return response.status;
  }, rate);
  if (accepted !== 200) throw new Error(`could not set the capture rate: the endpoint answered ${accepted}`);
  await page.waitForFunction(
    () => /ownship track: [1-9]\d* reported position/.test(document.querySelector('[data-testid="ownship-status"]')?.textContent ?? ''),
    undefined,
    { timeout: 60_000 },
  );

  for (const projection of PROJECTIONS) {
    await page.selectOption('[data-testid="projection-select"]', projection.value);
    // The volume asks for every level of the holding's depth axis, one area query each.
    await page.waitForTimeout(Number(process.env.DROGNA_MAP_SETTLE_MS ?? 4000));
    const layers = (
      await page.getAttribute('.map-panel', 'data-map-layers')
    )?.split(' ').filter((id) => id.length > 0) ?? [];
    drawn[projection.name] = layers;
    await page.screenshot({ path: join(outDir, `ownship-${projection.name}.png`), fullPage: false });

    if (!layers.some((id) => id.endsWith('ownship-track'))) {
      failures.push(`the ${projection.name} projection drew no ownship track`);
    }
    if (!layers.some((id) => id.endsWith('ownship-reports'))) {
      failures.push(`the ${projection.name} projection drew no reported positions`);
    }
  }

  const status = await page.getByTestId('ownship-status').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const provenance = {
    proof: 'SC-07: the ownship track appears in all three projections',
    images: PROJECTIONS.map((projection) => `ownship-${projection.name}.png`),
    run_id: runId ?? 'unknown',
    clock: `set to ${rate} for the capture and not pinned: the track only grows while the platform is reporting`,
    layers_drawn: drawn,
    status_line: status ?? 'unreadable',
    not_asserted_here:
      'that the volume’s track sits at the depths the platform reported. It cannot be read off a canvas, ' +
      'and is asserted over the frame’s own cartesian coordinates in app/src/panels/map/cube.test.ts.',
    viewport: { width: 1440, height: 900 },
    browser: { name: 'chromium', version: browser.version() },
  };
  await writeFile(join(outDir, 'sc-07.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  for (const projection of PROJECTIONS) {
    console.log(`${projection.name}: ${drawn[projection.name]?.length ?? 0} layer(s) drawn`);
  }
  console.log(outDir);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SC-07: ${failure}`);
  process.exit(1);
}
console.log('SC-07: the ownship track was drawn in the plan view, the globe and the volume.');
