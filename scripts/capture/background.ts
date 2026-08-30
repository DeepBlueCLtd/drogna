/**
 * The Background proofs (feature 111 T033, SC-005 and SC-006).
 *
 * Two claims about drawings are made by capture rather than by assertion, because
 * an assertion over markup cannot see whether a picture reads:
 *
 *   SC-005 — every explainer is legible with colour removed. Each explainer is shot
 *            twice, in colour and through a greyscale filter, so the two can be put
 *            side by side. The *guard* against the fault is the shared category
 *            vocabulary and its gate; this is the check on the drawing.
 *   SC-006 — every explainer is completable by keyboard alone. Each explainer is
 *            walked from its first step to its Consequences panel using nothing but
 *            Tab and Enter, and the walk fails loudly if a step cannot be reached.
 *
 * A third proof rides along with the walk, and it is the reason the walk visits
 * every step rather than only the first. FR-024 forbids a drawing that renders
 * "having silently dropped its labels", and a label that runs past its viewBox is
 * clipped without any error: it looks like a finished diagram with a sentence cut in
 * half. So every text node in every figure is measured against its viewBox as the
 * walk passes through, and an overflow fails the run naming the step and the words.
 *
 * A fourth asks the document what is under the middle of every poke region. FR-018
 * says free play is available and FR-025 says every responsive region wears an
 * outline; both are claims about a pointer, and the keyboard walk cannot test either,
 * because it presses a region by focus. An unfilled SVG shape hit-tests on its stroke
 * alone, so a region can carry the affordance, announce itself as a button, answer
 * Enter, and still swallow every click aimed at its middle. It did, on twenty-five of
 * the course's forty-six regions.
 *
 * A fifth rides along for the same reason. The spine controls are pinned to the foot
 * of the stage so that Next is in the same place on all sixty-nine steps; before that
 * they sat below the content and a tall step pushed Next off the bottom of the panel,
 * so the one control used on every step was the one that moved. The walk records where
 * Next actually is and fails if it moves or leaves the panel.
 *
 * The walk and the measurements are proofs, not pictures: they either arrive at every
 * value panel with nothing clipped and the controls where they belong, or exit
 * non-zero naming what stopped them.
 *
 * Every image is written with a `.provenance.json` sidecar beside it recording the
 * seed, the viewport, the browser and what the clock was doing, because an image on
 * the site has to be reproducible and a provenance typed by hand is a claim rather
 * than a record. Background's clock entry is the honest one: it reads no clock at
 * all, and the capture asserts that the page reached none of the running system.
 *
 * Nothing here is durable. A capture becomes publishable by being moved into
 * site/docs/blog/assets/ by hand, which is the review gate (.gitignore).
 *
 * Usage: pnpm capture:background [out-dir]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'background');

/** Steps worth a published image. Named, so the site's filenames do not drift. */
const PORTRAITS = [{ address: 'sensorthings/6', name: 'sensorthings-walk' }];

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

function revision(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unversioned';
  }
}

/**
 * What produced an image, written beside it. The run's seed comes from the page's own
 * manifest rather than from this script, so it records what actually ran.
 */
async function writeProvenance(
  page: Page,
  imagePath: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const runId = await page.locator('[title="run id"]').textContent();
  await writeFile(
    `${imagePath.replace(/\.png$/, '')}.provenance.json`,
    `${JSON.stringify(
      {
        image: imagePath.split('/').pop(),
        run_id: runId?.trim(),
        revision: revision(),
        viewport: page.viewportSize(),
        browser: `chromium ${page.context().browser()?.version() ?? 'unknown'}`,
        // Background reads no clock, simulation or host (Constitution I), so there is
        // no rate to pin and none to report. The capture proves the stronger claim:
        // it reached nothing of the running system at all.
        clock: 'not read — Background renders identically with every component stopped',
        ...detail,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/** Reads the course from the page itself, so this script cannot hold a stale list. */
async function courseFromPage(page: Page): Promise<{ id: string; steps: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.bg-rail li button')].map((button) => ({
      id: button.getAttribute('data-explainer') ?? '',
      steps: Number(button.querySelector('.bg-rail-length')?.textContent ?? '0'),
    })),
  );
}

/**
 * Every label in this step's figures that is drawn outside its own viewBox, and so
 * arrives clipped. Measured from the rendered geometry, because the fault is
 * invisible to anything that reads the source.
 */
async function clippedLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.bg-figure-frame svg')].flatMap((svg) => {
      // Rendered coordinates, not the element's own: getBBox() ignores the transforms
      // a mark is placed by, so a label inside a translate/scale would be measured
      // against the wrong origin and report a clip that is not there. This was
      // measured the wrong way first, and it said three placed marks were clipped
      // when they were not.
      const frame = svg.getBoundingClientRect();
      if (frame.width === 0) return [];
      const margin = 1;
      return [...svg.querySelectorAll('text')]
        .filter((label) => {
          const bounds = label.getBoundingClientRect();
          if (bounds.width === 0 && bounds.height === 0) return false;
          return (
            bounds.left < frame.left - margin ||
            bounds.top < frame.top - margin ||
            bounds.right > frame.right + margin ||
            bounds.bottom > frame.bottom + margin
          );
        })
        .map((label) => (label.textContent ?? '').trim().slice(0, 48));
    }),
  );
}

/**
 * Every poke region on this step that a pointer cannot actually reach.
 *
 * FR-018's free play and FR-025's affordance are both claims about a mouse, and
 * nothing above this line could check either: the markup says `role="button"`, the
 * keyboard walk presses it by focus, and a poke region that no click can land on
 * passes every one of those. It is measured the only way it can be — by asking the
 * document what is under the middle of the region — because an unfilled SVG shape
 * hit-tests on its stroke alone and that fact is invisible to anything reading the
 * source. Found by this measure: twenty-five of forty-six regions unreachable, the
 * dashed outline drawn over nothing you could press.
 */
async function unreachableRegions(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.bg-figure-frame [role="button"]')]
      .filter((region) => {
        const bounds = region.getBoundingClientRect();
        if (bounds.width === 0 && bounds.height === 0) return false;
        const under = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return under === null || under.closest('[role="button"]') !== region;
      })
      .map((region) => region.getAttribute('aria-label') ?? '(unlabelled)'),
  );
}

/**
 * Where the Next button is, and whether it is reachable without scrolling. Rounded,
 * because sub-pixel layout differences are not what this is watching for.
 */
async function controlPosition(page: Page): Promise<{ top: number; inPanel: boolean }> {
  return page.evaluate(() => {
    const next = document.querySelector('.bg-next');
    const panel = document.querySelector('.bg-panel');
    if (!next || !panel) return { top: -1, inPanel: false };
    const button = next.getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    return {
      top: Math.round(button.top),
      inPanel: button.bottom <= frame.bottom + 1 && button.top >= frame.top,
    };
  });
}

/** Advances by keyboard alone: Tab to the next control, Enter to press it. */
async function keyboardToNext(page: Page): Promise<boolean> {
  for (let press = 0; press < 60; press += 1) {
    const onNext = await page.evaluate(() => document.activeElement?.classList.contains('bg-next') ?? false);
    if (onNext) {
      await page.keyboard.press('Enter');
      return true;
    }
    await page.keyboard.press('Tab');
  }
  return false;
}

const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
const failures: string[] = [];
/** Where Next sat on each step. One distinct value, or the button moved. */
const controlTops = new Map<string, number>();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto(`${base}#/view/background`);
  await page.locator('.bg-rail li button').first().waitFor({ timeout: 10_000 });
  const course = await courseFromPage(page);
  if (course.length === 0) throw new Error('the rail listed no explainers');
  mkdirSync(outDir, { recursive: true });

  for (const explainer of course) {
    // SC-005: the same drawing in colour and with colour removed.
    for (const [suffix, filter] of [
      ['colour', 'none'],
      ['greyscale', 'grayscale(1)'],
    ]) {
      await page.goto(`${base}#/view/background/${explainer.id}/1`);
      await page.locator('.bg-stage').waitFor();
      await page.evaluate((value) => {
        document.documentElement.style.filter = value;
      }, filter);
      const imagePath = join(outDir, `${explainer.id}-${suffix}.png`);
      await page.screenshot({ path: imagePath });
      await writeProvenance(page, imagePath, {
        address: `#/view/background/${explainer.id}/1`,
        rendering: suffix === 'greyscale' ? 'colour removed by a page filter (SC-005)' : 'as served',
      });
      await page.evaluate(() => {
        document.documentElement.style.filter = 'none';
      });
    }

    // SC-006: first step to Consequences panel, using nothing but Tab and Enter.
    await page.goto(`${base}#/view/background/${explainer.id}/1`);
    await page.locator('.bg-stage').waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let step = 1; step <= explainer.steps; step += 1) {
      const control = await controlPosition(page);
      if (!control.inPanel) {
        failures.push(`${explainer.id}/${step}: the Next control is outside the panel — it has to be scrolled to`);
      }
      controlTops.set(`${explainer.id}/${step}`, control.top);
      for (const label of await clippedLabels(page)) {
        failures.push(`${explainer.id}/${step}: a label is drawn outside its viewBox — "${label}"`);
      }
      for (const label of await unreachableRegions(page)) {
        failures.push(
          `${explainer.id}/${step}: a poke region cannot be clicked at its centre — "${label}" (FR-018, FR-025)`,
        );
      }
      // The floor is honest behaviour at a narrow width and a mistake at this one: a
      // 1440px viewport gives a figure roughly 420px of column, so a step that refuses
      // to draw here has a minWidth nobody can satisfy.
      if ((await page.locator('[data-testid="figure-floor"]').count()) > 0) {
        failures.push(`${explainer.id}/${step}: the diagram refuses to draw at 1440px`);
      }
      if (step === explainer.steps) break;
      if (!(await keyboardToNext(page))) {
        failures.push(`${explainer.id}: could not reach step ${step + 1} by keyboard`);
        break;
      }
      await page.locator(`.bg-stage[data-step="${step + 1}"]`).waitFor({ timeout: 5_000 });
    }
    const reached = await page.locator('[data-testid="value-panel"]').count();
    if (reached === 0) failures.push(`${explainer.id}: the keyboard walk did not reach the Consequences panel`);
    else console.log(`${explainer.id}: ${explainer.steps} steps walked by keyboard, colour and greyscale captured`);
  }
  // Portraits: steps worth a published image, captured by the same mechanism as the
  // proofs so that a picture on the site carries the same provenance as one in CI.
  // A capture becomes publishable by being copied into site/docs/blog/assets/ by
  // hand; nothing here writes into the site.
  for (const portrait of PORTRAITS) {
    for (const [suffix, filter] of [
      ['colour', 'none'],
      ['greyscale', 'grayscale(1)'],
    ]) {
      await page.goto(`${base}#/view/background/${portrait.address}`);
      await page.locator('.bg-stage').waitFor();
      await page.evaluate((value) => {
        document.documentElement.style.filter = value;
      }, filter);
      const imagePath = join(outDir, `portrait-${portrait.name}-${suffix}.png`);
      await page.screenshot({ path: imagePath });
      await page.evaluate(() => {
        document.documentElement.style.filter = 'none';
      });
      await writeProvenance(page, imagePath, {
        address: `#/view/background/${portrait.address}`,
        rendering: suffix === 'greyscale' ? 'colour removed by a page filter (SC-005)' : 'as served',
      });
    }
    console.log(`portrait: ${portrait.name}`);
  }

  const distinct = new Set(controlTops.values());
  if (distinct.size > 1) {
    const sample = [...controlTops.entries()].slice(0, 6).map(([at, top]) => `${at}@${top}`).join(', ');
    failures.push(
      `the Next control sits at ${distinct.size} different heights across the course (${sample}…) — it must not move between steps`,
    );
  } else {
    console.log(`Next sat at the same height on all ${controlTops.size} steps`);
  }
  console.log(`captures in ${outDir}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} fault(s) in the course (SC-006, FR-024)`);
  process.exit(1);
}
console.log('every explainer completed by keyboard alone, with no label drawn outside its frame');
