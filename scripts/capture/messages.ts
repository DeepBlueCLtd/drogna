/**
 * SC-01, watched happening (feature 115 T013).
 *
 * The claim is one sentence: *stopping the sensors from Operator visibly stills the
 * observation lane in Messages, with no refresh and no reload.* It is the feature's
 * yardstick made visible, and it is the reason Messages was built first — the design
 * language is proved here before three more surfaces are built on it.
 *
 * A green unit test cannot make that claim. It can assert that a lane's mark count fell,
 * which is a fact about a data structure; the claim is about a running page a reader is
 * looking at. So this drives the real shell in a real browser: it opens Operator, presses
 * the sensors' own stop control, moves to Messages, and measures the lanes before and
 * after. Generator to pixel, never inferred from green tests (Constitution IX, PR-06).
 *
 * **It is a proof, not a picture.** Two images are written because a reader of the pull
 * request should be able to see it, but the run exits non-zero when the claim fails —
 * when the observation lane did not still, or when the clock lane stilled with it, which
 * would mean the page had stopped rather than the traffic. A capture that always
 * succeeds is a screenshot script.
 *
 * The clock is left running, deliberately and unlike `glance.ts`: the whole point is
 * that one lane goes quiet while another goes on beating, and a pinned clock would
 * still both. The provenance sidecar says so rather than leaving a reader to notice.
 *
 * Usage: pnpm capture:messages [out-dir]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'messages');

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


/** How many marks each lane is carrying, read off the running page. */
async function laneMarks(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-lane]')].map((lane) => [
        lane.getAttribute('data-lane') ?? '',
        Number(lane.getAttribute('data-marks') ?? '0'),
      ]),
    ),
  );
}

const failures: string[] = [];
const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
mkdirSync(outDir, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}#/view/messages`);
  await page.getByTestId('sim-time').waitFor({ timeout: SHELL_TIMEOUT });
  await page.getByTestId('traffic-display').waitFor({ timeout: SHELL_TIMEOUT });

  // Run the simulation faster than real time for the capture, through the shell's own
  // rate control. Not cosmetic: the heartbeat cadence is host time (ADR-0006) while
  // sampling is simulation time, so at rate 1 the control lane's twenty heartbeats a
  // cadence crowd the observation lane out of a window measured in messages — and an
  // observation lane that is empty because it was outnumbered proves nothing about
  // stopping the sensors. Found by running this and watching it report an empty lane.
  const rate = Number(process.env.DROGNA_MESSAGES_RATE ?? 60);
  const accepted = await page.evaluate(async (value) => {
    const response = await fetch('/api/ctl/clock/rate', {
      method: 'PUT',
      body: JSON.stringify({ rate: value }),
    });
    return response.status;
  }, rate);
  if (accepted !== 200) throw new Error(`could not set the capture rate: the endpoint answered ${accepted}`);

  // Let the harness run long enough for the observation lane to be busy. The clock is
  // never pinned: a still picture of a stopped clock would prove the opposite of the
  // claim, which is that one lane stills while another goes on beating.
  await page.waitForTimeout(Number(process.env.DROGNA_MESSAGES_WARM_MS ?? 8000));
  const before = await laneMarks(page);
  await page.screenshot({ path: join(outDir, 'traffic-running.png'), fullPage: false });

  if ((before.obs ?? 0) === 0) {
    failures.push('the observation lane was empty before the sensors were stopped: nothing to still');
  }
  if ((before.ctl ?? 0) === 0) {
    failures.push('the control lane was empty before the sensors were stopped: the harness was not running');
  }

  // Stop the sensors from the Operator tab, through the control a reader would use.
  // The capture drives the shell; it never reaches past it.
  await page.goto(`${base}#/view/operator`);
  await page.getByTestId('view-toggle').waitFor({ timeout: SHELL_TIMEOUT });
  const list = page.getByTestId('view-toggle');
  if ((await list.textContent())?.includes('show the list')) await list.click();
  const sensorRow = page.locator('[data-operator-component="sensors"]');
  await sensorRow.waitFor({ timeout: SHELL_TIMEOUT });
  const stop = sensorRow.getByRole('button', { name: 'stop' });
  await stop.waitFor({ timeout: SHELL_TIMEOUT });
  await stop.click();

  // Back to Messages. Nothing is refreshed and nothing is reloaded: the hash changes,
  // the shell shows the panel it already had, and the panel has been listening
  // throughout — which is exactly the claim.
  await page.goto(`${base}#/view/messages`);
  await page.getByTestId('traffic-display').waitFor({ timeout: SHELL_TIMEOUT });
  await page.waitForTimeout(Number(process.env.DROGNA_MESSAGES_SETTLE_MS ?? 12_000));
  const after = await laneMarks(page);
  await page.screenshot({ path: join(outDir, 'traffic-sensors-stopped.png'), fullPage: false });

  if ((after.obs ?? 0) >= (before.obs ?? 0)) {
    failures.push(
      `the observation lane did not still: ${before.obs ?? 0} marks before the stop, ${after.obs ?? 0} after`,
    );
  }
  if ((after.ctl ?? 0) === 0) {
    failures.push(
      'the control lane stilled too, so the page stopped rather than the traffic — which is not the claim',
    );
  }

  const rateText = await page.getByTestId('sim-rate').textContent();
  const simTime = await page.getByTestId('sim-time').textContent();
  const runId = await page.locator('.shell-run').textContent();
  const provenance = {
    proof: 'SC-01: stopping the sensors from Operator stills the observation lane in Messages',
    images: ['traffic-running.png', 'traffic-sensors-stopped.png'],
    run_id: runId ?? 'unknown',
    sim_time: simTime ?? 'unknown',
    clock:
      `${rateText ?? 'unknown'} — set to ${rate} for the capture and deliberately NOT pinned: ` +
      'the claim is that one lane stills while another goes on beating, and a stopped ' +
      'clock would still both',
    lane_marks_before: before,
    lane_marks_after: after,
    driven_through: 'the shell’s own controls: the sensors’ stop button on the Operator list view',
    viewport: { width: 1440, height: 900 },
    browser: { name: 'chromium', version: browser.version() },
  };
  await writeFile(join(outDir, 'sc-01.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`observation lane: ${before.obs ?? 0} marks running, ${after.obs ?? 0} with the sensors stopped`);
  console.log(`control lane: ${before.ctl ?? 0} marks running, ${after.ctl ?? 0} with the sensors stopped`);
  console.log(outDir);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`SC-01: ${failure}`);
  process.exit(1);
}
console.log('SC-01: the observation lane stilled and the clock lane beat on.');
