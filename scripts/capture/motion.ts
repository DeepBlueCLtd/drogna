/**
 * The motion capture (SRD-v2 FR-19, and the reason for it below).
 *
 * `capture:glance` photographs the shell. That is the right tool for a layout, a figure
 * or a state, and it is the wrong tool for a *movement*: the Operator tab's cards now
 * grow into place and the chart reflows around them, and neither a still nor a link to a
 * running instance puts that in front of a reader who is not going to click it. A picture
 * of something that moves has to move.
 *
 * So this drives the page exactly as `capture:glance` does — same local server over the
 * committed build, same clock pinned through the shell's own seam, same provenance
 * sidecar — and records a burst of frames across one interaction instead of one frame
 * after it. What comes out is a GIF, because a GIF plays in a blog entry, in a pull
 * request and in a chat window with nothing installed and nothing clicked.
 *
 * Usage:
 *   pnpm capture:motion <view> <out.gif>
 * Environment:
 *   DROGNA_MOTION_ACT      selector to click to start the movement (required)
 *   DROGNA_MOTION_CLIP     x,y,width,height in CSS pixels; the region worth watching
 *   DROGNA_MOTION_FRAMES   how many frames to take (default 14)
 *   DROGNA_MOTION_EVERY_MS host milliseconds between frames (default 40)
 *   DROGNA_MOTION_HOLD     frames to repeat at the end, so a loop pauses on the result
 *   DROGNA_GLANCE_WARM_RATE / DROGNA_GLANCE_WARM_MS   as capture:glance
 */
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import runConfigDocument from '../../app/config/run.json' with { type: 'json' };
import { decodePng, encodeGif, type Frame } from './gif.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const viewId = process.argv[2];
const outPath = process.argv[3] ?? join(repoRoot, '.capture', `motion-${viewId ?? 'default'}.gif`);
const act = process.env.DROGNA_MOTION_ACT;
if (!act) throw new Error('DROGNA_MOTION_ACT: a motion capture needs something to set in motion');

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

/**
 * How long a capture waits for the shell to be there.
 *
 * It was ten seconds, on the reckoning that a page which has not rendered in ten is a page
 * that is not going to. Feature 118 changed what that number is measuring: the shell is
 * mounted only once the chosen situation's pre-roll has finished, and a pre-roll is
 * thousands of stepped ticks — measured at two to eight seconds in a browser here, and a
 * CI runner is slower than here. Ten seconds was no longer a bound on "not going to
 * render"; it was a coin toss on the longest condition.
 */
const SHELL_TIMEOUT = 60_000;


// Which situation the capture opens in (feature 118). The default comes from the
// configuration document rather than from a literal here, so a renamed condition moves
// the captures with it.
const startCondition = process.env.DROGNA_START ?? runConfigDocument.start_conditions.default;

const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
try {
  const viewport = { width: 1440, height: 900 };
  const page = await browser.newPage({ viewport });
  // The front door is the welcome page since feature 118, so a capture of the shell
  // names the situation it wants in the query string. It is named even when a view is
  // deep-linked — a deep link opens the shell on its own, but a picture of "whichever
  // situation happens to be the default" is a picture whose contents nobody can account
  // for, and the sidecar should be able to say which run this was.
  await page.goto(`${base}?start=${startCondition}${viewId ? `#/view/${viewId}` : ''}`);
  await page.getByTestId('sim-time').waitFor({ timeout: SHELL_TIMEOUT });

  // Let the run get somewhere, then pin the clock — a capture of a moving interface
  // should still be a capture of a stopped simulation, so what moves in the picture is
  // the thing being demonstrated and not the world underneath it (FR-19).
  const warmRate = Number(process.env.DROGNA_GLANCE_WARM_RATE ?? 0);
  const warmMillis = Number(process.env.DROGNA_GLANCE_WARM_MS ?? 0);
  if (warmRate > 0 && warmMillis > 0) {
    const accepted = await page.evaluate(async (rate) => {
      const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate }) });
      return response.status;
    }, warmRate);
    if (accepted !== 200) throw new Error(`could not set the warming rate: ${accepted}`);
    await page.waitForTimeout(warmMillis);
  }
  const pinned = await page.evaluate(async () => {
    const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: 0 }) });
    return response.status;
  });
  if (pinned !== 200) throw new Error(`could not pin the clock: ${pinned}`);
  await page.waitForFunction(() =>
    (document.querySelector('[data-testid="sim-rate"]')?.textContent ?? '').includes('rate 0'),
  );
  await page.waitForTimeout(Number(process.env.DROGNA_GLANCE_SETTLE_MS ?? 2500));

  const clipText = process.env.DROGNA_MOTION_CLIP;
  const clip = clipText
    ? (([x, y, width, height]) => ({ x, y, width, height }))(clipText.split(',').map(Number))
    : undefined;
  const count = Number(process.env.DROGNA_MOTION_FRAMES ?? 14);
  const every = Number(process.env.DROGNA_MOTION_EVERY_MS ?? 40);
  const hold = Number(process.env.DROGNA_MOTION_HOLD ?? 6);

  const shots: Buffer[] = [await page.screenshot({ clip })];
  // The click is not awaited: the movement is what is being recorded, and waiting for
  // the click to settle would photograph its result rather than its middle.
  const clicking = page.click(act);
  for (let taken = 1; taken < count; taken++) {
    await page.waitForTimeout(every);
    shots.push(await page.screenshot({ clip }));
  }
  await clicking;
  const last = await page.screenshot({ clip });
  for (let held = 0; held < hold; held++) shots.push(last);

  const frames: Frame[] = shots.map((png) => decodePng(png));
  const gif = encodeGif(frames, every);
  mkdirSync(dirname(outPath), { recursive: true });
  await writeFile(outPath, gif);

  const rateText = await page.getByTestId('sim-rate').textContent();
  const simTime = await page.getByTestId('sim-time').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const provenance = {
    image: basename(outPath),
    run_id: runId ?? 'unknown',
    view: viewId ?? 'first configured view',
    sim_time: simTime ?? 'unknown',
    clock_pinned: rateText ?? 'unknown',
    motion: { acted_on: act, frames: frames.length, frame_interval_ms: every, held_frames: hold },
    clip: clip ?? 'the whole viewport',
    viewport,
    browser: { name: 'chromium', version: browser.version() },
    caption: process.env.DROGNA_GLANCE_CAPTION ?? '',
  };
  await writeFile(outPath.replace(/\.gif$/, '.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);

  console.log(outPath);
  console.log(
    `${frames.length} frame(s) at ${every} ms, ${frames[0].width}×${frames[0].height}; ` +
      `simulated rate in force: ${rateText ?? 'unknown'}; sim time ${simTime ?? 'unknown'}`,
  );
} finally {
  await browser.close();
  server.close();
}
