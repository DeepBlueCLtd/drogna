/**
 * The narrow-presentation proofs (feature 112, SC-001 to SC-003 and SC-010).
 *
 * These are made by capture rather than by assertion because they are claims about
 * *geometry*, and an assertion over markup cannot see whether something fits. A test
 * can prove the tab strip lists seven views; only a browser at 390 by 844 can say
 * whether the seventh is reachable, whether the page has to be pushed sideways to see
 * a table, and how much of a phone's screen the harness's own furniture has taken
 * before any of the demonstration is shown.
 *
 * What it proves, at each supported size, for every configured view:
 *
 *   SC-001 — nothing scrolls sideways except the few containers built to. A layout the
 *            viewer has to push sideways to read is the failure a stylesheet written on
 *            a laptop produces, every time.
 *
 *            The first version of this check measured the *document*, and it was worth
 *            nothing: every panel clips, so no arrangement of content inside one can
 *            widen the page. Planting a 900px table in a panel passed it clean. What it
 *            measures now is every element that scrolls horizontally, against the short
 *            list of containers declared to — and the same plant fails it, which is the
 *            only reason to believe the check at all.
 *   SC-002 — every tab in the strip is reachable, and each is at least 44 CSS pixels
 *            high: a thumb, not a cursor.
 *   SC-003 — the shell's own chrome takes no more than a quarter of the viewport
 *            height. Landscape is the case that fails first, which is why it is here
 *            rather than assumed away.
 *   SC-008 — no step of the Background course tells a phone to widen a window it cannot
 *            widen. Every one of the 69 steps is visited at a phone's width and checked
 *            for the floor message; a diagram too wide for the screen is drawn at its own
 *            minimum in a frame that pans instead.
 *   SC-010 — the published preview page frames the built shell and opens it at the view
 *            its address names. It drives the published page rather than the source,
 *            because the page a reviewer opens is the artefact, not the file.
 *
 * A screenshot of each view is written beside the proofs with a `.provenance.json`
 * sidecar, on the site's standing rule: an image is a claim, and a provenance typed by
 * hand is a claim about a claim.
 *
 * Nothing here is durable. A capture becomes publishable by being moved into
 * site/docs/blog/assets/ by hand, which is the review gate (.gitignore).
 *
 * Usage: pnpm capture:mobile [out-dir]
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
const outDir = process.argv[2] ?? join(repoRoot, '.capture', 'mobile');

/**
 * The sizes proved. Portrait is the case the presentation is for; landscape is the same
 * phone rotated, and it is a *short* viewport rather than a wide one — the case where
 * chrome that looked modest in portrait eats the screen.
 */
const SIZES = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'phone-small', width: 360, height: 800 },
];

/**
 * The containers allowed to scroll sideways, each because something in it genuinely
 * cannot fold: a table, a diagram drawn at its own minimum, the tab strip, a document.
 * Anything else that scrolls sideways is a layout that did not fit and did not say so.
 */
const MAY_SCROLL_SIDEWAYS = [
  '.stack-tabs',
  '.table-scroll',
  '.bg-figure-pan',
  // The Operator flow chart (feature 113). It is the second instance of the same case
  // as `.bg-figure-pan`: a diagram whose geometry is its meaning, drawn at the size it
  // needs and panned rather than shrunk past legibility. Squeezing fifty routed edges
  // into 360 pixels would not be a smaller picture of the system, and the narrow
  // presentation folds the panel's controls instead — it may fold a surface, never
  // remove one, which is why the list view is not this canvas's small-screen
  // replacement. Every other view is still held to the rule.
  '.flow-canvas-scroll',
  // The Intro architecture drawing (feature 117), and the third instance of the same
  // case. It scales to fit where the shortfall is small and pans at full size below
  // that floor; a phone is always below it, so a phone always pans. The alternative is
  // a 618-pixel drawing rendered at 0.6, which is FR-024's own prohibition — scaled
  // past legibility — and the labels are the component names, so losing them loses the
  // picture. The panel's prose and its controls fold normally around it.
  '.intro-figure-pan',
  '.messages-list-scroll',
  '.message-detail',
  'pre',
];

/** No more than this share of the viewport's height may be the shell's own furniture. */
const CHROME_SHARE = 0.25;
/** The smaller side of the controls a viewer navigates with: the tabs. */
const TAP_TARGET = 44;
/**
 * And of the chrome's own controls — the clock rates, the manifest buttons. Lower on
 * purpose: they are hit rarely, and six full-size controls cost more of a 390-pixel-tall
 * screen than the compaction gives back. The exception is measured rather than merely
 * argued, which is why there are two numbers here instead of one and a comment.
 */
const CHROME_TARGET = 32;

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

/** The views the shell is configured with, read from the page so this cannot go stale. */
async function viewsFromPage(page: Page): Promise<{ id: string; label: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.stack-tabs [role="tab"]')].map((tab) => ({
      id: tab.getAttribute('data-view') ?? '',
      label: (tab.textContent ?? '').trim(),
    })),
  );
}

/** Everything the geometry has to say about one view, measured in the browser. */
async function measure(page: Page): Promise<{
  sidewaysScrollers: { what: string; content: number; box: number }[];
  chromeHeight: number;
  viewportHeight: number;
  shortestTab: number;
  undersizedChrome: { what: string; height: number }[];
  unreachableTabs: string[];
  presentation: string | null;
  shownView: string | null;
}> {
  return page.evaluate((allowed: string[]) => {
    const root = document.documentElement;
    const sideways = [root, ...document.querySelectorAll<HTMLElement>('.shell *')]
      // SVG elements are excluded: inside an SVG, clientWidth and scrollWidth do not
      // mean what they mean in HTML, and every <text> in a diagram reported an overflow
      // it did not have. What a diagram's labels do at the edge of their frame is
      // already measured, properly, against the viewBox — by the Background proof
      // (`capture/background.ts`), which is where that check belongs.
      .filter((element) => element.namespaceURI === 'http://www.w3.org/1999/xhtml')
      .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1)
      .filter((element) => !allowed.some((selector) => element.matches(selector)))
      .map((element) => ({
        what: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().split(/\s+/).join('.')}` : ''}`,
        content: Math.round(element.scrollWidth),
        box: Math.round(element.clientWidth),
      }));
    const header = document.querySelector('.shell-header');
    const strip = document.querySelector('.stack-tabs');
    const tabs = [...document.querySelectorAll<HTMLElement>('.stack-tabs [role="tab"]')];
    const stripBox = strip?.getBoundingClientRect();
    // A tab is reachable if the strip can scroll it into view — which is what the strip
    // is for. Unreachable means clipped with nowhere to scroll to, the fault a
    // non-scrolling tab bar has at this width.
    const unreachable = tabs
      .filter((tab) => {
        if (!stripBox || !strip) return true;
        const box = tab.getBoundingClientRect();
        const within = box.left >= stripBox.left - 1 && box.right <= stripBox.right + 1;
        const scrollable = strip.scrollWidth > strip.clientWidth + 1;
        return !within && !scrollable;
      })
      .map((tab) => tab.getAttribute('data-view') ?? '');
    return {
      sidewaysScrollers: sideways,
      chromeHeight:
        (header?.getBoundingClientRect().height ?? 0) + (stripBox?.height ?? 0),
      viewportHeight: window.innerHeight,
      shortestTab: tabs.length
        ? Math.min(...tabs.map((tab) => tab.getBoundingClientRect().height))
        : 0,
      undersizedChrome: [...document.querySelectorAll<HTMLElement>('.shell-header button, .shell-header select, .shell-header .shell-import')]
        .map((control) => ({
          what: (control.textContent ?? '').trim().slice(0, 24),
          height: control.getBoundingClientRect().height,
        }))
        .filter((control) => control.height > 0 && control.height < 32),
      unreachableTabs: unreachable,
      presentation: document.querySelector('.shell')?.getAttribute('data-presentation') ?? null,
      shownView: document.querySelector('.stack-view:not([hidden])')?.getAttribute('data-view') ?? null,
    };
  }, MAY_SCROLL_SIDEWAYS);
}

const browser = await chromium.launch({ executablePath: process.env.DROGNA_CHROMIUM_PATH });
const failures: string[] = [];
try {
  mkdirSync(outDir, { recursive: true });

  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(base);
    await page.locator('.stack-tabs').waitFor({ timeout: 10_000 });

    // Pin the clock through the shell's own seam, so a picture of a stopped system is
    // never handed over as a live one (FR-19). Rate zero is a legitimate rate.
    const pinned = await page.evaluate(async () => {
      const response = await fetch('/api/ctl/clock/rate', { method: 'PUT', body: JSON.stringify({ rate: 0 }) });
      return response.status;
    });
    if (pinned !== 200) throw new Error(`could not pin the clock: rate endpoint answered ${pinned}`);

    const views = await viewsFromPage(page);
    if (views.length === 0) throw new Error(`${size.name}: the tab strip listed no views`);

    for (const view of views) {
      await page.goto(`${base}#/view/${view.id}`);
      await page.locator('.stack-tabs').waitFor();
      // Layout settles on a frame, not on a clock: wait for the shown view to be the
      // one asked for rather than for an interval to pass (Constitution I).
      await page
        .locator(`.stack-view[data-view="${view.id}"]:not([hidden])`)
        .waitFor({ timeout: 10_000 });
      // And for the panel itself, not the placeholder a deferred one shows while its
      // chunk arrives (`shell/registry.tsx`). Without this the map view was measured and
      // photographed as one line of text: the proof passed, and had stopped saying
      // anything about the view it named.
      await page
        .locator(`.stack-view[data-view="${view.id}"] [data-testid="panel-arriving"]`)
        .waitFor({ state: 'detached', timeout: 15_000 });
      const seen = await measure(page);
      const where = `${size.name} ${view.id}`;

      if (seen.presentation !== 'stack') {
        failures.push(`${where}: the shell is in the '${seen.presentation}' presentation at ${size.width}px`);
      }
      if (seen.shownView !== view.id) {
        failures.push(`${where}: the address named ${view.id} and ${seen.shownView} is shown`);
      }
      // SC-001. One pixel of tolerance: sub-pixel layout is not what this watches for.
      for (const scroller of seen.sidewaysScrollers) {
        failures.push(
          `${where}: ${scroller.what} scrolls sideways — ${scroller.content}px of content in ${scroller.box}px, and it is not a container declared to scroll`,
        );
      }
      // SC-002.
      if (seen.unreachableTabs.length > 0) {
        failures.push(`${where}: tab(s) no viewer can reach: ${seen.unreachableTabs.join(', ')}`);
      }
      if (seen.shortestTab < TAP_TARGET) {
        failures.push(`${where}: a tab is ${Math.round(seen.shortestTab)}px high; a thumb needs ${TAP_TARGET}px`);
      }
      for (const control of seen.undersizedChrome) {
        failures.push(
          `${where}: the chrome control '${control.what}' is ${Math.round(control.height)}px high; the floor is ${CHROME_TARGET}px`,
        );
      }
      // SC-003.
      const share = seen.chromeHeight / seen.viewportHeight;
      if (share > CHROME_SHARE) {
        failures.push(
          `${where}: the shell's own chrome takes ${Math.round(share * 100)}% of the height; the bound is ${Math.round(CHROME_SHARE * 100)}%`,
        );
      }

      const imagePath = join(outDir, `${size.name}-${view.id}.png`);
      await page.screenshot({ path: imagePath });
      await writeProvenance(page, imagePath, {
        address: `#/view/${view.id}`,
        size: size.name,
        presentation: seen.presentation,
        chrome_share: Number(share.toFixed(3)),
      });
    }
    // SC-008, at the portrait size: the course's own advice has to stay followable.
    if (size.name === 'phone-portrait') {
      await page.goto(`${base}#/view/background`);
      await page.locator('.bg-rail select').waitFor({ timeout: 10_000 });
      const course = await page.evaluate(() =>
        [...document.querySelectorAll('.bg-rail select option')].map((option) => ({
          id: option.getAttribute('value') ?? '',
          steps: Number(/(\d+) steps/.exec(option.textContent ?? '')?.[1] ?? '0'),
        })),
      );
      if (course.length === 0) failures.push('phone-portrait background: the rail listed no explainers');
      let panned = 0;
      for (const explainer of course) {
        for (let step = 1; step <= explainer.steps; step += 1) {
          await page.goto(`${base}#/view/background/${explainer.id}/${step}`);
          await page.locator(`.bg-stage[data-step="${step}"]`).waitFor({ timeout: 10_000 });
          const seen = await page.evaluate(() => ({
            floor: document.querySelector('[data-testid="figure-floor"]')?.textContent ?? null,
            pan: document.querySelector('[data-testid="figure-pan"]') !== null,
          }));
          if (seen.floor !== null) {
            failures.push(
              `phone-portrait background ${explainer.id}/${step}: the step asks the viewer to widen a window they cannot widen — "${seen.floor.trim()}"`,
            );
          }
          if (seen.pan) panned += 1;
        }
      }
      // A proof that never met the case it is for has proved nothing. The course carries
      // figures wider than a phone, so some step must have panned; if none did, either
      // the figures shrank or the path stopped being reached, and both are worth knowing.
      if (panned === 0) {
        failures.push(
          'phone-portrait background: no step needed the pannable frame, so this proof did not exercise it',
        );
      } else {
        console.log(`mobile: ${panned} background step(s) drew a diagram wider than the screen, panned rather than withheld`);
      }
    }

    await page.close();
  }

  // SC-010: the published preview page, driven as a reviewer drives it. It is the
  // artefact a pull request links, so it is proved from the build rather than the file.
  const preview = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await preview.goto(`${base}mobile.html#/view/map`);
  const framed = preview.frameLocator('iframe#frame');
  await framed.locator('.stack-tabs').waitFor({ timeout: 10_000 });
  const inFrame = await framed
    .locator('.stack-view:not([hidden])')
    .getAttribute('data-view');
  if (inFrame !== 'map') {
    failures.push(`the preview page opened the framed shell at '${inFrame}', not at the view its address named`);
  }
  const frameSize = await preview.evaluate(() => {
    const device = document.getElementById('device');
    return { width: device?.clientWidth ?? 0, height: device?.clientHeight ?? 0 };
  });
  if (frameSize.width !== 390 || frameSize.height !== 844) {
    failures.push(`the preview frame is ${frameSize.width}×${frameSize.height}; it defaults to 390×844 (FR-022)`);
  }
  const says = (await preview.locator('body').textContent()) ?? '';
  if (!/not a device/i.test(says)) {
    failures.push('the preview page does not say that it mocks a size rather than a device (FR-024)');
  }
  const previewImage = join(outDir, 'preview-frame.png');
  await preview.screenshot({ path: previewImage });
  await writeProvenance(preview, previewImage, {
    address: 'mobile.html#/view/map',
    note: 'the published preview page, framing the built shell at 390×844',
  });
  await preview.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`mobile: ${failure}`);
  console.error(`${failures.length} narrow-presentation proof(s) failed`);
  process.exit(1);
}
console.log(`mobile: the narrow presentation holds at ${SIZES.map((s) => s.name).join(', ')}; images in ${outDir}`);
