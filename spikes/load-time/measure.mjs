/**
 * First-load timings for a built instance, under a named machine and a named line.
 *
 *   node spikes/load-time/measure.mjs http://127.0.0.1:4174/ 4x slowish
 *   node spikes/load-time/measure.mjs http://127.0.0.1:4174/ 1x none
 *
 * The reading that matters is SHELL-USABLE: navigation start to the moment #root holds
 * real content. FCP arrives at almost the same instant because nothing paints before
 * the boot finishes — which is itself the finding.
 *
 * The CPU multiplier is the important axis and the easy one to leave out. A developer's
 * machine at 1x is not the machine this is watched on; 4x is a mid-range laptop and 6x a
 * low-end one, in Chromium's own scale.
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4174/';
const cpu = Number((process.argv[3] ?? '1x').replace('x', ''));
const line = process.argv[4] ?? 'none';

const LINES = {
  none: null,
  broadband: { downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: 1e6, latency: 40 },
  slowish: { downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: 5e5, latency: 80 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
};
if (!(line in LINES)) throw new Error(`no line named '${line}'; have ${Object.keys(LINES).join(', ')}`);

// The estate's own browser, wherever the environment put it.
const executablePath = process.env.DROGNA_CHROMIUM;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const session = await page.context().newCDPSession(page);
if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });
if (LINES[line]) {
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', { offline: false, ...LINES[line] });
}

await page.addInitScript(() => {
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
    }
  }).observe({ entryTypes: ['longtask'] });
});

const startedAt = Date.now();
await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
await page
  .waitForFunction(() => document.querySelectorAll('#root *').length > 20, null, { timeout: 120_000 })
  .catch(() => undefined);
const usable = Date.now() - startedAt;
await page.waitForTimeout(3000);

const reading = await page.evaluate(() => {
  const navigation = performance.getEntriesByType('navigation')[0];
  const paint = (name) => Math.round(performance.getEntriesByName(name)[0]?.startTime ?? 0);
  return {
    ttfb: Math.round(navigation.responseStart),
    firstPaint: paint('first-paint'),
    firstContentfulPaint: paint('first-contentful-paint'),
    load: Math.round(navigation.loadEventEnd),
    resources: performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').pop(),
      start: Math.round(r.startTime),
      duration: Math.round(r.duration),
      transfer: r.transferSize,
      decoded: r.decodedBodySize,
    })),
    longTasks: window.__longTasks.filter((t) => t.duration > 50),
  };
});

console.log(`\n### ${url}   cpu=${cpu}x   line=${line}`);
console.log(
  `TTFB ${reading.ttfb}ms | first-paint ${reading.firstPaint}ms | FCP ${reading.firstContentfulPaint}ms | ` +
    `load ${reading.load}ms | SHELL-USABLE ${usable}ms`,
);
for (const r of reading.resources) {
  console.log(
    `  ${r.name.padEnd(28)} start=${String(r.start).padStart(5)} duration=${String(r.duration).padStart(6)} ` +
      `transfer=${r.transfer} decoded=${r.decoded}`,
  );
}
const blocked = reading.longTasks.reduce((total, task) => total + task.duration, 0);
console.log(`long tasks over 50ms: ${JSON.stringify(reading.longTasks)}`);
console.log(`main thread blocked for ${blocked}ms across ${reading.longTasks.length} task(s)`);

await browser.close();
