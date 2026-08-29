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
 * The walk and the measurement are proofs, not pictures: they either arrive at every
 * value panel with nothing clipped, or exit non-zero naming what stopped them.
 *
 * Usage: pnpm capture:background [out-dir]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'app', 'dist');
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'background');

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
      await page.screenshot({ path: join(outDir, `${explainer.id}-${suffix}.png`) });
      await page.evaluate(() => {
        document.documentElement.style.filter = 'none';
      });
    }

    // SC-006: first step to Consequences panel, using nothing but Tab and Enter.
    await page.goto(`${base}#/view/background/${explainer.id}/1`);
    await page.locator('.bg-stage').waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let step = 1; step <= explainer.steps; step += 1) {
      for (const label of await clippedLabels(page)) {
        failures.push(`${explainer.id}/${step}: a label is drawn outside its viewBox — "${label}"`);
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
