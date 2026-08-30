/**
 * The consumer tabs' proofs (feature 118, T035).
 *
 * Two claims that markup cannot answer on its own, made against the built site the same
 * way Background's are:
 *
 *   **Every control is reachable and operable by keyboard.** Not a walk — a consumer tab
 *   has no walk, it has a panel of controls and a map — so the claim is a sweep: Tab from
 *   the top of the panel to the bottom and account for every interactive element on the
 *   way. An element the sweep never lands on is a control a viewer without a pointer does
 *   not have. Each one reached is also asked for an accessible name and for a focus
 *   indicator, because a control that is focusable but unnamed is reachable and unusable,
 *   and one that is focusable but shows nothing is reachable and unfindable.
 *
 *   The sweep's own limit, stated because it is easy to mistake for coverage: it takes the
 *   expected set from what the document already declares focusable, so it catches a control
 *   that is *declared* and unreachable, not one that was never declared. A `div` with a
 *   click handler and no `tabindex` is invisible to it — and so, more to the point, would
 *   be the map with its `tabIndex` taken away, which is precisely the regression this
 *   exists to stop. That gap is closed from the other side: an element that declares
 *   `aria-keyshortcuts` promises keys and must therefore be reachable, and every map must
 *   declare them. The two checks meet in the middle.
 *
 *   **The map moves under the keyboard.** The sweep proves the map can be focused; this
 *   proves focusing it is worth something. The zoom is read back off the panel's own
 *   readout and the hexes off the drawing, so what is checked is that the picture changed,
 *   not that a handler was called.
 *
 * The greyscale pair is shot here too, but it is the illustration rather than the proof:
 * the bound is held in `app/src/panels/consumers/greyscale.test.ts`, where a regression
 * fails a run instead of waiting for someone to compare two pictures.
 *
 * Why a script of its own rather than a branch inside `capture/background.ts`: that one is
 * built around a slide rail — its walk drives a rail only Background has and its
 * measurements are of that panel's figures. Sharing it would mean rewriting it to be about
 * neither panel in particular. This is the second capture of the same *kind*, not the same
 * capture over more views.
 *
 * Usage: pnpm capture:consumers [out-dir]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import runConfigDocument from '../../app/config/run.json' with { type: 'json' };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'consumers');

/** How many presses the sweep will spend before it decides the focus order is a loop. */
const SWEEP_LIMIT = 400;

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
 * Which situation these pictures are of (feature 120), and how long the shell may take to
 * be there. Both arrived with start conditions and both are load-bearing here.
 *
 * The front door is the welcome page now, so this names the situation it wants rather
 * than landing on a page of cards. And the shell is mounted only once that situation's
 * pre-roll has finished — thousands of stepped ticks — so `.shell` is no longer proof
 * that a run exists behind it: the welcome page is a `.shell` too, and this script pinned
 * the clock against one, got 503 from a seam with no run provisioned, and failed. It
 * waits for the clock strip instead, which nothing but a mounted shell draws.
 */
const startCondition = process.env.DROGNA_START ?? runConfigDocument.start_conditions.default;
const SHELL_TIMEOUT = 60_000;

/** Every navigation is a fresh page and so a fresh run; each one waits for its own. */
async function openShell(page: Page, view?: string): Promise<void> {
  await page.goto(`${base}?start=${startCondition}${view ? `#/view/${view}` : ''}`);
  await page.getByTestId('sim-time').waitFor({ timeout: SHELL_TIMEOUT });
}

function revision(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unversioned';
  }
}

async function writeProvenance(page: Page, imagePath: string, detail: Record<string, unknown>): Promise<void> {
  const runId = await page.locator('.shell-run').textContent().catch(() => undefined);
  await writeFile(
    `${imagePath.replace(/\.png$/, '')}.provenance.json`,
    `${JSON.stringify(
      {
        image: imagePath.split('/').pop(),
        run_id: runId?.trim(),
        revision: revision(),
        viewport: page.viewportSize(),
        browser: `chromium ${page.context().browser()?.version() ?? 'unknown'}`,
        clock: 'pinned to rate 0 for the capture (FR-19)',
        ...detail,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/**
 * The consumer views the shell is configured with, read from the page.
 *
 * From the page rather than from a list here, for the reason the whole file exists: a
 * fourth consumer tab added next year has to join the proof by being configured, not by
 * being remembered.
 */
async function consumerViewsFromPage(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-kind="consumer"]')]
      .map((mark) => mark.getAttribute('data-view') ?? '')
      .filter((id) => id !== ''),
  );
}

interface Reached {
  readonly sweep: string;
  readonly what: string;
  readonly name: string;
  readonly indicated: boolean;
}

/** Tags every interactive element in the panel, so the sweep can name what it landed on. */
async function markControls(page: Page): Promise<{ sweep: string; what: string }[]> {
  return page.evaluate(() => {
    const panel = document.querySelector('.consumer-panel');
    if (!panel) return [];
    const controls = [
      ...panel.querySelectorAll<HTMLElement>(
        'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute('disabled'));
    return controls.map((element, index) => {
      element.setAttribute('data-sweep', String(index));
      const label =
        element.getAttribute('aria-label') ??
        element.closest('label')?.textContent ??
        element.getAttribute('title') ??
        element.textContent ??
        '';
      return {
        sweep: String(index),
        what: `${element.tagName.toLowerCase()}${element.getAttribute('type') ? `[${element.getAttribute('type')}]` : ''} ${label.trim().slice(0, 40)}`.trim(),
      };
    });
  });
}

/** What the focus is on now, and whether a viewer could tell. */
async function focused(page: Page): Promise<Reached | undefined> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || !element.closest('.consumer-panel')) return undefined;
    const style = getComputedStyle(element);
    const outlined =
      style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    const shadowed = style.boxShadow !== 'none' && style.boxShadow !== '';
    const label =
      element.getAttribute('aria-label') ??
      element.closest('label')?.textContent ??
      element.getAttribute('title') ??
      element.textContent ??
      '';
    return {
      sweep: element.getAttribute('data-sweep') ?? '',
      what: element.tagName.toLowerCase(),
      name: label.trim(),
      indicated: outlined || shadowed,
    };
  });
}

/** The zoom the panel is reporting, and the first hex as drawn — the view, observed. */
async function mapState(page: Page, view: string): Promise<{ zoom: string; firstHex: string }> {
  return page.evaluate((id) => {
    // The readout shares its span with the reset button, so take the factor alone:
    // a failure message reading "×1.0whole domain" costs the reader a second look.
    const said = document.querySelector(`[data-testid="${id}-zoom"]`)?.textContent ?? '';
    const hex = document.querySelector(`[data-testid="${id}-map"] polygon`)?.getAttribute('points') ?? '';
    return { zoom: (/×\s*[\d.]+/.exec(said) ?? ['none'])[0], firstHex: hex };
  }, view);
}

const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
const failures: string[] = [];
try {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await openShell(page);

  // A picture of a stopped system is never handed over as a live one (FR-19).
  const pinned = await page.evaluate(async () => {
    const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: 0 }) });
    return response.status;
  });
  if (pinned !== 200) throw new Error(`could not pin the clock: rate endpoint answered ${pinned}`);

  const views = await consumerViewsFromPage(page);
  if (views.length === 0) throw new Error('the shell showed no consumer views');

  for (const view of views) {
    await openShell(page, view);
    await page.locator('.consumer-panel').waitFor({ timeout: SHELL_TIMEOUT });
    await page
      .locator('[data-testid="panel-arriving"]')
      .waitFor({ state: 'detached', timeout: SHELL_TIMEOUT });

    // The sweep. Tab from the top of the document and account for every control.
    const controls = await markControls(page);
    if (controls.length === 0) throw new Error(`${view}: the panel declared no controls to sweep`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const reached = new Map<string, Reached>();
    for (let press = 0; press < SWEEP_LIMIT; press += 1) {
      await page.keyboard.press('Tab');
      const here = await focused(page);
      if (!here) continue;
      if (reached.has(here.sweep)) break; // Round the loop once is enough.
      reached.set(here.sweep, here);
    }

    const where = `${view}`;
    for (const control of controls) {
      const landed = reached.get(control.sweep);
      if (!landed) {
        failures.push(`${where}: Tab never reaches ${control.what} — it is a control a keyboard cannot use`);
        continue;
      }
      if (landed.name === '') {
        failures.push(`${where}: ${control.what} takes focus with no accessible name`);
      }
      if (!landed.indicated) {
        failures.push(`${where}: ${control.what} takes focus with nothing on screen to say so`);
      }
    }

    // A promise of keys is a promise of focus. This is what stops the map quietly losing
    // its `tabIndex` and taking the sweep's expectations with it.
    const promising = await page.evaluate(() =>
      [...document.querySelectorAll('.consumer-panel [aria-keyshortcuts]')].map((element) => ({
        sweep: element.getAttribute('data-sweep'),
        keys: element.getAttribute('aria-keyshortcuts') ?? '',
      })),
    );
    for (const promise of promising) {
      if (promise.sweep === null || !reached.has(promise.sweep)) {
        failures.push(
          `${where}: something declares the keys '${promise.keys}' and Tab never reaches it`,
        );
      }
    }
    const undeclared = await page.evaluate(() =>
      [...document.querySelectorAll('.consumer-map')].filter(
        (map) => !map.hasAttribute('aria-keyshortcuts'),
      ).length,
    );
    if (undeclared > 0) {
      failures.push(`${where}: ${undeclared} map(s) take keys without declaring them in aria-keyshortcuts`);
    }

    // The map, driven by keyboard alone. Only the map-bearing tabs have one.
    if ((await page.locator(`[data-testid="${view}-map"]`).count()) > 0) {
      const before = failures.length;
      await page.locator(`[data-testid="${view}-map"]`).focus();
      const whole = await mapState(page, view);
      await page.keyboard.press('+');
      const closer = await mapState(page, view);
      if (closer.zoom === whole.zoom) {
        failures.push(`${where}: '+' left the zoom at ${whole.zoom} — the map does not zoom by keyboard`);
      }
      await page.keyboard.press('ArrowRight');
      const panned = await mapState(page, view);
      if (panned.firstHex === closer.firstHex) {
        failures.push(`${where}: ArrowRight redrew nothing — the map does not pan by keyboard`);
      }
      await page.keyboard.press('Home');
      const back = await mapState(page, view);
      if (back.zoom !== whole.zoom) {
        failures.push(`${where}: Home left the zoom at ${back.zoom} rather than ${whole.zoom}`);
      }
      // Only when it is true. A run that announces the map works and then reports that it
      // does not is a run whose output has to be read twice to find out which it meant.
      if (failures.length === before) console.log(`${view}: zoomed, panned and reset by keyboard`);
    }

    // The illustration: the same tab with colour and without it.
    for (const [suffix, filter] of [
      ['colour', 'none'],
      ['greyscale', 'grayscale(1)'],
    ]) {
      await page.evaluate((value) => {
        document.documentElement.style.filter = value;
      }, filter);
      const imagePath = join(outDir, `${view}-${suffix}.png`);
      await page.screenshot({ path: imagePath });
      await writeProvenance(page, imagePath, {
        address: `#/view/${view}`,
        rendering:
          suffix === 'greyscale'
            ? 'colour removed by a page filter; the bound itself is held in greyscale.test.ts'
            : 'as served',
      });
      await page.evaluate(() => {
        document.documentElement.style.filter = 'none';
      });
    }
    console.log(`${view}: ${controls.length} control(s) swept, colour and greyscale captured`);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`consumers: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`consumers: every control reachable and named by keyboard; images in ${outDir}`);
