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
 *   DROGNA_FORECAST_WIDTH   viewport width (default 2560; see the note on `width`)
 *   DROGNA_FORECAST_CYCLES  analysis cycles to warm through (default 3)
 *   DROGNA_FORECAST_CAPTION the sidecar's caption
 */
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import runConfigDocument from "../../app/config/run.json" with { type: "json" };
import type { ConfigRun } from "../../app/src/generated/types.js";

const config = runConfigDocument as ConfigRun;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = join(repoRoot, "app", "dist");
const outPath =
  process.argv[2] ?? join(repoRoot, ".capture", "forecast-column.png");
const startCondition =
  process.env.DROGNA_FORECAST_START ?? config.start_conditions.default;
/**
 * Wide, and for a stated reason: the centre region is one column of a three-column layout, so
 * the viewport width is what the FR-130 numbers table gets. At 1280 the region is 388 px and the
 * table — six sources against contribution, separation, declared error and background error —
 * scrolls inside its own box with the separation column cut mid-value. The entry's requirement
 * paragraph promises exactly those two errors, so an artefact that clips them is evidence for a
 * claim it does not contain. At 2560 the region is 815 px and the table fits whole. How the same
 * region behaves at a phone's width is measured by this script's own narrow pass, below — this
 * line used to send the reader to `capture:mobile`, which cannot answer it: that proof pins the
 * clock and picks no column, so the rays, the profile and the numbers table are absent from every
 * frame it takes. The two sentences disagreed for as long as the narrow pass existed, and the
 * next person removing "duplicated" narrow-width machinery would have read this one.
 */
const width = Number(process.env.DROGNA_FORECAST_WIDTH ?? 2560);
/**
 * How many analysis cycles to warm through before the shutter. Three rather than one: the
 * measurement footprint on the first cycle is a single cell's worth and the share map has almost
 * nothing in it to point at. Stated here and in the sidecar, because "warmed until it looked
 * right" is not a reproducible instruction.
 */
const cycles = Number(process.env.DROGNA_FORECAST_CYCLES ?? 3);
/**
 * How many times the page is reloaded trying to catch the pre-roll's own instant before the pin.
 *
 * The window is a mount, a render and a round trip against one real second, and nothing bounds
 * it; three is enough that a machine which loses the race once does not lose the build, and few
 * enough that a machine losing it every time says so rather than looping.
 */
const PIN_ATTEMPTS = 3;
const height = 1000;

/**
 * A PNG's own width and height, from the IHDR chunk: eight bytes of signature, four of length,
 * four of type, then two big-endian 32-bit integers. Eleven lines rather than a dependency, and
 * the point is that the sidecar's dimensions come from the bytes that were written.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47)
    throw new Error("the capture is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Warm the page's *standing* contributions holding, find the drawn cell nearest the column its
 * header names, and click it. Returns how many rays that column drew.
 *
 * A function rather than an inline evaluate because it is asked twice: once at the shot's own
 * width, and again after the resize to a phone's, where the shell changes presentation and
 * remounts the panel — so the column a reader picked at a desk is not still open, and a narrow
 * pass that only resized was measuring a region with nothing in it.
 */
async function pickAColumn(page: Page, prefix: string) {
  return page.evaluate(async (prefix: string) => {
    const inventory = await (await fetch("/api/ctl/holdings")).json();
    const holdings = inventory.holdings.filter(
      (holding: { field: { format: string } }) =>
        holding.field.format === "drogna-contributions-v1",
    );
    // The standing cycle, which is the one the panel draws: a start condition pre-rolls several.
    const holding = holdings[holdings.length - 1];
    if (!holding)
      return {
        rays: 0,
        holding: "none",
        why: "no contributions holding was published",
      };
    const header = await (
      await fetch(`${prefix}/${holding.holding_id}`)
    ).json();
    if (!header.sources?.length)
      return {
        rays: 0,
        holding: holding.holding_id,
        why: "the cycle assimilated nothing",
      };
    const want = header.sources[0].cell;
    // **Polled for, not assumed.** The caller waits for the field before calling this, and that
    // was still not enough: between the wait and the click the field can be re-rendered — a new
    // cycle's slab arriving, a depth reset — and the picker reported "no drawn cell to click"
    // about half the time at a phone's width. A function that needs cells waits for cells.
    let drawn = document.querySelectorAll("rect.share-cell").length;
    for (let wait = 0; wait < 60 && drawn === 0; wait++) {
      await new Promise((settled) => setTimeout(settled, 200));
      drawn = document.querySelectorAll("rect.share-cell").length;
    }
    let nearest: SVGRectElement | undefined;
    let best = Infinity;
    for (const node of document.querySelectorAll("rect.share-cell")) {
      const cell = node as SVGRectElement;
      const distance = Math.hypot(
        Number(cell.getAttribute("data-lon")) - want.longitude,
        Number(cell.getAttribute("data-lat")) - want.latitude,
      );
      if (distance < best) {
        best = distance;
        nearest = cell;
      }
    }
    if (!nearest)
      return {
        rays: 0,
        holding: holding.holding_id,
        why: "no drawn cell to click",
      };
    // Polled rather than slept. Opening a column is seven position queries and a contributions
    // read, and after a resize the panel has remounted and is refetching its slab as well — a
    // fixed 800 ms was enough at the shot's width and not at a phone's, where the first version
    // of the narrow pass reported "no column could be opened" for a column that opened a moment
    // later.
    //
    // **And the click is inside the loop, because a cycle clears the picked column.** The narrow
    // pass runs the clock at `max_rate` so a panel remounted by a breakpoint crossing recovers on
    // a restatement rather than waiting on a frozen clock for one; at that rate a new analysis
    // lands roughly every 0.17 s of real time, and every one of them clears the pick by design —
    // it is a different field. Clicking once and then polling loses the race whenever a cycle
    // falls between the two, and the poll has no way to notice: it reports "no column could be
    // opened" and reddens CI for a layout that is fine. Re-picking each pass costs one click on
    // a cell already open and closes the window.
    let rays = 0;
    for (let wait = 0; wait < 60 && rays === 0; wait++) {
      const cell = document.querySelector(
        `rect.share-cell[data-lon="${nearest.getAttribute("data-lon")}"][data-lat="${nearest.getAttribute("data-lat")}"]`,
      );
      // The node is re-created on every cycle, so the *position* is what identifies the cell —
      // the captured `nearest` is detached from the document the moment the field is redrawn and
      // clicking it does nothing at all.
      (cell ?? nearest).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((settled) => setTimeout(settled, 200));
      rays = document.querySelectorAll("line.forecast-ray").length;
    }
    return {
      rays,
      holding: holding.holding_id,
      why: "picked from the served header",
    };
  }, prefix);
}

/**
 * The phone sizes the narrow pass measures at, matching `scripts/capture/mobile.ts`'s own two
 * portrait sizes. Landscape is left to that script: this region is a tall column and the
 * question a phone asks of it is width.
 */
const NARROW_SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".snapshot": "application/octet-stream",
  ".woff2": "font/woff2",
};

const server = createServer((request, response) => {
  void (async () => {
    const path =
      normalize((request.url ?? "/").split("?")[0]).replace(/^\/+/, "") ||
      "index.html";
    try {
      const body = await readFile(join(distDir, path));
      response.writeHead(200, {
        "content-type": MIME[extname(path)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  })();
});
await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
const address = server.address();
if (address === null || typeof address === "string")
  throw new Error("no listening address");
const base = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch({
  executablePath: process.env.DROGNA_CHROMIUM_PATH,
});
try {
  const stepTicks = config.operator.step.maximum_ticks;
  // The pin has to catch the pre-roll's own instant; where it does not, the page is reloaded and
  // the whole approach tried again. The loop exits the moment `drift === 0`.
  let page = await browser.newPage({ viewport: { width, height } });
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0)
      page = await browser.newPage({ viewport: { width, height } });
    // **One navigation, carrying both the start condition and the view.** This was two: a first
    // goto with `?start=` and a second with the hash alone. The second dropped the query, which
    // makes it a full reload onto the *default* condition — so `DROGNA_FORECAST_START` did
    // nothing, and the evaluate that followed ran against a shell that had not finished
    // provisioning a run and was answering 503. `capture:glance` has always done it in one.
    await page.goto(`${base}?start=${startCondition}#/view/forecast`);
    await page.getByTestId("sim-time").waitFor({ timeout: 60_000 });

    // Warmed through the shell's own step endpoint, in bursts, until an analysis cycle has
    // published — the clock is pinned to rate 0 first, so nothing here reads host time and the
    // picture is of a stated simulated instant (Principle I).
    //
    // **Every response is read, and the burst size comes from the configuration.** The first
    // version sent `ticks: 120` and checked nothing. `operator.step.maximum_ticks` is 60, so the
    // plane refused all sixty bursts — "120 ticks is beyond the declared bound of 60" — and the
    // loop advanced the simulation by nothing at all. What made the picture was the pre-roll
    // running on at the configured rate while Playwright worked, which is exactly the host-time
    // dependence the docstring above claims is absent: the sidecar recorded `rate 1` and a
    // `sim_time` 22 seconds past the pre-roll's end. A refusal is now a thrown error rather than
    // a silent no-op, and the bound is read from the same document the plane reads it from
    // (Constitution IV).
    const pinned = await page.evaluate(async () => {
      const response = await fetch("/api/ctl/clock/rate", {
        method: "PUT",
        body: JSON.stringify({ rate: 0 }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };
    });
    if (!pinned.ok)
      throw new Error(
        `the clock would not pin: ${pinned.status} ${pinned.body}`,
      );
    await page.waitForFunction(
      () =>
        /rate 0/.test(
          document.querySelector('[data-testid="sim-rate"]')?.textContent ?? "",
        ),
      { timeout: 30_000 },
    );

    // **The instant the pin caught, checked against the one the configuration says it should.**
    //
    // The pre-roll pins the clock for its own script and, in a `finally`, restores the configured
    // rate — one tick per real second — *before the shell mounts*. This script pins only after
    // waiting for the shell to render, so the simulation free-runs for the width of that render and
    // round trip. The committed sidecar happens to show none of that drift, which is evidence the
    // window was under a second on one machine and not that it is bounded; on a loaded runner the
    // shot is of a different simulated instant, of possibly a different cycle, and nothing else
    // here would notice — `warmed.cycles >= 3` and `picked.rays > 0` both still hold.
    //
    // So the bound is taken from disk rather than from hope: a condition's pre-roll is the sum of
    // its legs' ticks, and one tick is `tick_interval_us`, so the simulated instant the pin should
    // have caught is arithmetic over `run.json`. Anything past it is host time in the artefact.
    const preRollTicks = (
      config.start_conditions.conditions.find(
        (entry) => entry.id === startCondition,
      )?.legs ?? []
    ).reduce((total, leg) => total + leg.ticks, 0);
    const tickSeconds = config.clock.tick_interval_us / 1_000_000;
    const epoch = Date.parse(config.clock.epoch);
    const atPin = await page.getByTestId("sim-time").textContent();
    const drift =
      Math.round((Date.parse(atPin ?? "") - epoch) / 1000 / tickSeconds) -
      preRollTicks;
    if (!Number.isFinite(drift))
      throw new Error(`the shell states no readable simulated time: ${atPin}`);
    if (drift !== 0) {
      // **Reloaded, not failed.** The window this drift measures — the pre-roll restoring the
      // configured rate, then a mount, a render and a Playwright round trip — is bounded by
      // nothing, so at one tick per real second a loaded runner can spend a tick inside it. The
      // first version threw here, which turned an unbounded window into a red CI step for a capture
      // that was otherwise correct, and `CLAUDE.md`'s own account of seven consecutive red runs is
      // the argument against doing that lightly. The artefact still has to be at the stated instant
      // — a tolerance would put host time in it — so the answer is to take the picture again rather
      // than to accept a different one or to give up on the first slow frame.
      if (attempt >= PIN_ATTEMPTS) {
        throw new Error(
          `the clock ran on before it could be pinned on ${attempt + 1} attempts, most recently by ${drift} tick(s): ` +
            `the shot would be of ${atPin} rather than the ${startCondition} pre-roll's own ${preRollTicks} ticks, ` +
            `which is host time in the artefact`,
        );
      }
      console.log(
        `forecast: the clock ran on ${drift} tick(s) before the pin; reloading (attempt ${attempt + 1})`,
      );
      await page.close();
      continue;
    }
    break;
  }

  // **The loop stops on a fact about the store, not on a class appearing in the document.** Its
  // first working version asked `document.querySelector('.forecast-share-map')` after each burst
  // and never once saw it — the shell's render is scheduled on a macrotask the evaluate's own
  // await chain does not reliably yield to — so it ran its whole budget every time and the
  // sidecar said "until an analysis cycle published" about a fixed number of ticks. Stepping a
  // fixed count would at least have been honest; asking the coverage store how many
  // contributions holdings it has is both, and it is the same question the picker below asks.
  const warmed = await page.evaluate(
    async ({
      ticks,
      cycles,
      budget,
    }: {
      ticks: number;
      cycles: number;
      budget: number;
    }) => {
      let seen = 0;
      let burst = 0;
      for (; burst < budget; burst++) {
        const inventory = await (await fetch("/api/ctl/holdings")).json();
        seen = inventory.holdings.filter(
          (holding: { field: { format: string } }) =>
            holding.field.format === "drogna-contributions-v1",
        ).length;
        if (seen >= cycles) break;
        const response = await fetch("/api/ctl/clock/step", {
          method: "POST",
          body: JSON.stringify({ ticks }),
        });
        if (!response.ok)
          return {
            bursts: burst,
            cycles: 0,
            refused: `${response.status} ${await response.text()}`,
          };
      }
      return { bursts: burst, cycles: seen, refused: "" };
    },
    { ticks: stepTicks, cycles, budget: 600 },
  );
  if (warmed.refused)
    throw new Error(`the step endpoint refused: ${warmed.refused}`);
  if (warmed.cycles < cycles) {
    throw new Error(
      `only ${warmed.cycles} of ${cycles} analysis cycles published within the step budget`,
    );
  }
  await page.waitForSelector(".forecast-share-map", { timeout: 60_000 });

  const picked = await pickAColumn(page, config.shell.endpoints.contributions);

  if (picked.rays === 0) {
    throw new Error(
      `no column drew a ray (${picked.why}); the picture would show an empty region`,
    );
  }

  const region = await page.$(".forecast-column");
  if (!region) throw new Error("the centre region is not on the page");

  // **The viewport is grown to the region before the shutter.** The first committed artefact was
  // 390x1593 with its last 659 rows a single flat `--shell-bg`: the region is taller than a
  // 1000 px viewport, and what was below the fold — the 800 m and 1000 m profile rows and the
  // whole of the FR-130 numbers table — was not in the picture at all. The blog entry's
  // requirement paragraph promises exactly the part that was missing, and its only evidence did
  // not contain it. Measured, resized, measured again; and the shot is refused rather than
  // truncated if the region still will not fit.
  const first = await region.boundingBox();
  if (!first) throw new Error("the centre region has no box to measure");
  const shotHeight = Math.ceil(first.height) + 40;
  await page.setViewportSize({ width, height: shotHeight });
  await page.waitForFunction(
    (wanted: number) =>
      (document.querySelector(".forecast-column")?.getBoundingClientRect()
        .height ?? 0) <= wanted,
    shotHeight,
    { timeout: 30_000 },
  );
  const box = await region.boundingBox();
  if (!box) throw new Error("the centre region has no box to measure");
  if (box.height > shotHeight) {
    throw new Error(
      `the region is ${Math.round(box.height)}px tall in a ${shotHeight}px viewport; it would be clipped`,
    );
  }

  // The clock is asserted still stopped at the shutter rather than assumed: the resize above
  // gives the shell a frame to react in, and a picture whose sidecar says `rate 0` has to have
  // been taken at rate 0.
  const rateAtShutter =
    (await page.getByTestId("sim-rate").textContent()) ?? "";
  if (!/rate 0/.test(rateAtShutter))
    throw new Error(`the clock was running at the shutter: ${rateAtShutter}`);

  mkdirSync(dirname(outPath), { recursive: true });
  await region.screenshot({ path: outPath });

  const simTime = await page.getByTestId("sim-time").textContent();
  const runId = await page.locator(".shell-run").textContent();
  const provenance = {
    image: basename(outPath),
    run_id: runId ?? "unknown",
    view: "forecast",
    start_condition: startCondition,
    sim_time: simTime ?? "unknown",
    clock_pinned: rateAtShutter,
    holding: picked.holding,
    rays_drawn: picked.rays,
    column:
      "read off the served contributions header, so it is a column an instrument reached",
    warmed: `stepped in bursts of ${stepTicks} ticks at rate 0 until ${cycles} analysis cycles had published (${warmed.bursts} bursts)`,
    viewport: { width, height: shotHeight },
    // **Read out of the file's own header, not off the element's box.** These disagreed —
    // 388x1592 recorded for a 390x1593 file — because the box is CSS pixels before rounding and
    // the shot is device pixels after it. A sidecar's whole job is to describe the artefact
    // beside it, so it reads the artefact.
    image_size: pngSize(await readFile(outPath)),
    element_box: {
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    browser: { name: "chromium", version: browser.version() },
    caption: process.env.DROGNA_FORECAST_CAPTION ?? "",
  };
  await writeFile(
    outPath.replace(/\.png$/, ".provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );

  /**
   * **The same region at a phone's width, warmed and with the column still open.**
   *
   * `capture:mobile` is the repository's narrow proof and it cannot see any of this: it pins the
   * clock to rate 0 before it measures and picks no column, so the rays, the profile, the
   * under-scale note and the numbers table are absent from every frame it takes — which is the
   * blindness `CLAUDE.md` records ("a capture proof measures a stopped harness") and the reason a
   * gauge that had overflowed its box since the day it was written survived every run of it.
   * Until now the only claim that this region held at 390 px was a sentence in `tasks.md` with a
   * throw-away script behind it and nothing on disk.
   *
   * Nothing is re-warmed: the page is the one that was just shot, so the loop is warm, the column
   * is open and the resize is the only variable.
   */
  // **The clock runs for this pass, and only for this pass.** The shot above is taken at rate 0
  // and is the artefact; this is a layout measurement, and it needs a live loop rather than a
  // deterministic instant. Stepping it was tried and does not work: crossing the breakpoint
  // remounts the panel, the remounted panel draws nothing until the analyst restates, and any
  // remount landing *after* the last step then waits for a restatement that a frozen clock never
  // delivers — about half of runs failed with "no drawn cell to click" for exactly that reason,
  // and no amount of polling wall time fixes a stopped simulation. Nothing here is recorded in
  // the sidecar, so nothing here reads host time into an artefact.
  //
  // The rate is the configured maximum, not 1. At rate 1 a restatement is `restate_every_ticks`
  // of *real* seconds away — 60 — so a remount landing between the wait and the click left the
  // region blank for longer than any poll worth writing, and one run in six still failed. At the
  // declared ceiling a restatement is about a second, so the recovery this pass depends on is
  // fast rather than merely possible. The bound is read from the clock's own configuration
  // (Constitution IV), never typed here.
  const narrowRate = config.clock.max_rate;

  const narrow: string[] = [];
  for (const size of NARROW_SIZES) {
    // Started per size, because the measurement below stops it again: the recovery needs time to
    // pass and the measurement needs it not to.
    const running = await page.evaluate(async (rate: number) => {
      const response = await fetch("/api/ctl/clock/rate", {
        method: "PUT",
        body: JSON.stringify({ rate }),
      });
      return response.ok;
    }, narrowRate);
    if (!running)
      throw new Error(
        `the clock would not run at ${narrowRate} for the narrow pass`,
      );
    await page.setViewportSize(size);
    await page.waitForFunction(
      (want: number) => window.innerWidth === want,
      size.width,
      { timeout: 15_000 },
    );
    // The narrow presentation puts regions behind disclosures, so a surface can be in the
    // document and not on the screen — FR-011 working, not a fault. Re-opened on every poll,
    // because a remount recreates them closed.
    await page.waitForFunction(
      () => {
        for (const details of document.querySelectorAll("details"))
          details.open = true;
        const field = document.querySelector(".forecast-share-map");
        return (
          field !== null &&
          document.querySelectorAll("rect.share-cell").length > 0 &&
          field.getBoundingClientRect().height > 0
        );
      },
      undefined,
      { timeout: 120_000, polling: 250 },
    );

    // Picked again here: crossing the breakpoint remounts the panel, so the column open at the
    // desk is not open on the phone, and measuring without re-picking measured an empty region
    // and called the region sound.
    const there = await pickAColumn(page, config.shell.endpoints.contributions);
    if (there.rays === 0) {
      narrow.push(
        `${size.width}x${size.height}: no column could be opened (${there.why})`,
      );
      continue;
    }
    // **Stopped again before measuring.** The clock runs for this pass because the remount
    // recovers on a restatement, and it runs at the configured ceiling so that recovery is fast —
    // but a new analysis cycle clears the picked column by design, and at that rate one lands
    // every fraction of a real second. Between the pick returning and the measuring evaluate the
    // column can be gone, and the pass then reports `.forecast-column-readout` "not on the page"
    // and reddens the build for a layout that is fine. Nothing below needs time to pass, so
    // nothing below gets any.
    const stopped = await page.evaluate(async () => {
      const response = await fetch("/api/ctl/clock/rate", {
        method: "PUT",
        body: JSON.stringify({ rate: 0 }),
      });
      return response.ok;
    });
    if (!stopped)
      throw new Error("the clock would not stop before the narrow measurement");
    await page.waitForFunction(
      () =>
        /rate 0/.test(
          document.querySelector('[data-testid="sim-rate"]')?.textContent ?? "",
        ),
      { timeout: 30_000 },
    );
    const measured = await page.evaluate((label: string) => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        out.push(`${label}: the page scrolls sideways`);
      }
      // **A selector that is not there is reported, not skipped.** `.forecast-ray-note` renders
      // only where a ray is under the width floor, and `.forecast-column-readout` only while a
      // column is open — which the running clock can clear between the pick and this measurement.
      // Skipping them silently made a list of three boxes read as coverage of three when it was
      // coverage of one, and the failure was invisible: the pass reported the region sound.
      const measuredHere: string[] = [];
      for (const selector of [".forecast-column", ".forecast-column-readout"]) {
        const node = document.querySelector(selector);
        if (!node) {
          out.push(
            `${label}: ${selector} was not on the page, so nothing was measured of it`,
          );
          continue;
        }
        measuredHere.push(selector);
        // A box whose content is wider than itself and which is not declared scrollable is
        // content a reader cannot reach. The numbers table is *meant* to scroll inside its own
        // box, which is why it is not in this list.
        if (node.scrollWidth > node.clientWidth + 1) {
          out.push(
            `${label}: ${selector} is ${node.scrollWidth}px of content in a ${node.clientWidth}px box`,
          );
        }
      }
      // **The map is measured against what contains it, and the reason is that the other test
      // cannot fire for it.** `.forecast-share-map` was in the list above; an SVG element reports
      // its own layout width as *both* `scrollWidth` and `clientWidth` — measured in this
      // Chromium: 900 and 900 for an svg overflowing a 200px parent — so `scrollWidth >
      // clientWidth` is false however far it sticks out. A selector that cannot report is worse
      // than no selector, because the list reads as coverage.
      // The under-scale note is measured where it exists and its absence is a fact rather than a
      // gap: a column whose rays are all above the floor draws no note, which is correct.
      const note = document.querySelector(".forecast-ray-note");
      if (note && note.scrollWidth > note.clientWidth + 1) {
        out.push(
          `${label}: the under-scale note is ${note.scrollWidth}px of content in a ${note.clientWidth}px box`,
        );
      }

      const map = document.querySelector(".forecast-share-map");
      const holder = map?.parentElement;
      if (
        map &&
        holder &&
        map.getBoundingClientRect().width > holder.clientWidth + 1
      ) {
        out.push(
          `${label}: the share field is ${Math.round(map.getBoundingClientRect().width)}px wide in a ${holder.clientWidth}px column`,
        );
      }
      return {
        failures: out,
        measured: [...measuredHere, ...(note ? [".forecast-ray-note"] : [])],
      };
    }, `${size.width}x${size.height}`);
    narrow.push(...measured.failures);
    // Printed, so the proof says what it looked at as well as what it found. A pass that reports
    // only failures cannot be told from a pass that measured nothing.
    console.log(
      `forecast: ${size.width}x${size.height} measured ${measured.measured.join(", ")}, and the share field`,
    );
  }
  if (narrow.length > 0)
    throw new Error(
      `the centre region does not hold at a phone's width:\n${narrow.join("\n")}`,
    );

  console.log(outPath);
  console.log(
    `forecast: ${picked.rays} ray(s) drawn from ${picked.holding}; sim time ${simTime ?? "unknown"}`,
  );
  console.log(
    `forecast: the region holds, warmed and with a column open, at ${NARROW_SIZES.map((size) => `${size.width}x${size.height}`).join(", ")}`,
  );
} finally {
  await browser.close();
  server.close();
}
