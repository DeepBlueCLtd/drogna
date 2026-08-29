/**
 * Where the boot second goes, phase by phase.
 *
 *   node spikes/load-time/phases.mjs 4x
 *
 * The marks cannot live in `app/src`: `performance.mark` is host time in operational
 * code, and a build carrying them is not the build anybody loads. So this script edits
 * the four files, builds, measures, and puts them back in a `finally` — a failed run
 * leaves the tree as it found it. It refuses to start against a dirty `app/src`, because
 * the restore would then be a lie about what was there before.
 *
 * The anchors below are exact strings from those files. If one stops matching, the
 * script says which and stops, rather than measuring a build with a mark missing and
 * reporting the phase as zero.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const cpu = Number((process.argv[2] ?? '4x').replace('x', ''));
const port = 4185;

const EDITS = [
  {
    file: 'app/src/bootstrap/main.tsx',
    at: [
      ['const config = runConfigDocument as ConfigRun;', "performance.mark('modules-done');\nconst config = runConfigDocument as ConfigRun;"],
      // The validator is memoised and built on first use, so these fire inside
      // validatorForRun() rather than at module scope — which is the point of it.
      ['  seamValidator ??= createSeamValidator();', "  performance.mark('validator-start');\n  seamValidator ??= createSeamValidator();\n  performance.mark('validator-end');"],
      ['  runtime = buildBackend(', "  performance.mark('backend-start');\n  runtime = buildBackend("],
      ['  const shellClient = runtime.transport.connect(', "  performance.mark('backend-end');\n  const shellClient = runtime.transport.connect("],
      ['    </StrictMode>,\n  );\n}', "    </StrictMode>,\n  );\n  performance.mark('render-end');\n}"],
    ],
  },
  {
    file: 'app/src/backend/runtime/runtime.ts',
    at: [
      ["  validated(validator, 'config.run', config);", "  performance.mark('config-start');\n  validated(validator, 'config.run', config);"],
      ['  const runId = deriveRunId(', "  performance.mark('config-end');\n  const runId = deriveRunId("],
      ['  for (const entry of boxes.values()) {\n    entry.box.component.start();', "  performance.mark('construct-end');\n  for (const entry of boxes.values()) {\n    entry.box.component.start();"],
      ['  clock.start();\n  for (const heartbeat of heartbeats) heartbeat.start();', "  performance.mark('subscribed');\n  clock.start();\n  performance.mark('provisioned');\n  for (const heartbeat of heartbeats) heartbeat.start();"],
    ],
  },
  {
    file: 'app/src/backend/env-generator/generator.ts',
    at: [
      ['    const lons = axisValues(grid.longitude);', "    performance.mark(`${era}-start`);\n    const lons = axisValues(grid.longitude);"],
      ['    const bytes = new Uint8Array(temperature.byteLength', "    performance.mark(`${era}-field-end`);\n    const bytes = new Uint8Array(temperature.byteLength"],
      ['    const fieldDigest = `sha256:${sha256Hex(bytes)}`;', "    const fieldDigest = `sha256:${sha256Hex(bytes)}`;\n    performance.mark(`${era}-digest-end`);"],
      ['    const verdict = this.store.publish({ descriptor, bytes });', "    performance.mark(`${era}-manifest-end`);\n    const verdict = this.store.publish({ descriptor, bytes });\n    performance.mark(`${era}-publish-end`);"],
    ],
  },
];

const MARKS = [
  'modules-done', 'validator-start', 'validator-end', 'backend-start', 'config-start', 'config-end',
  'construct-end', 'subscribed', 'archive-start', 'archive-field-end', 'archive-digest-end',
  'archive-manifest-end', 'archive-publish-end', 'nowcast-start', 'nowcast-field-end',
  'nowcast-digest-end', 'nowcast-manifest-end', 'nowcast-publish-end', 'provisioned', 'backend-end',
  'render-end',
];

const dirty = execFileSync('git', ['status', '--porcelain', 'app/src'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error(`app/src has uncommitted changes; this script restores by overwrite and would lose them:\n${dirty}`);
  process.exit(1);
}

const originals = new Map(EDITS.map(({ file }) => [file, readFileSync(file, 'utf8')]));
let server;
let browser;
try {
  for (const { file, at } of EDITS) {
    let source = originals.get(file);
    for (const [anchor, replacement] of at) {
      if (!source.includes(anchor)) throw new Error(`${file}: anchor no longer present: ${JSON.stringify(anchor.slice(0, 60))}`);
      source = source.replace(anchor, replacement);
    }
    writeFileSync(file, source);
  }

  execFileSync('pnpm', ['-C', 'app', 'build'], { stdio: 'inherit' });

  const { createServer } = await import('node:http');
  const { gzipSync } = await import('node:zlib');
  const { existsSync } = await import('node:fs');
  const { join, extname } = await import('node:path');
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  // A throw in here is outside the try below and would exit the process with the marks
  // still in the tree, so the handler answers everything — the browser asks for a
  // favicon nobody built.
  server = createServer((request, response) => {
    let path = request.url.split('?')[0];
    if (path.endsWith('/')) path += 'index.html';
    const file = join('app/dist', path);
    if (!existsSync(file)) {
      response.writeHead(404);
      return response.end('not here');
    }
    const body = gzipSync(readFileSync(file));
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': body.length });
    response.end(body);
  }).listen(port, '127.0.0.1');

  const executablePath = process.env.DROGNA_CHROMIUM;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage();
  const session = await page.context().newCDPSession(page);
  if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const at = await page.evaluate((names) => {
    const found = {};
    for (const name of names) {
      const entry = performance.getEntriesByName(name)[0];
      found[name] = entry ? entry.startTime : null;
    }
    const navigation = performance.getEntriesByType('navigation')[0];
    const script = performance.getEntriesByType('resource').find((r) => r.name.endsWith('.js'));
    found['#script-end'] = script ? script.responseEnd : null;
    found['#fcp'] = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    found['#load'] = navigation.loadEventEnd;
    return found;
  }, MARKS);

  const missing = MARKS.filter((name) => at[name] === null);
  if (missing.length > 0) throw new Error(`marks never fired (stale bundle, or a phase not reached): ${missing.join(', ')}`);

  const span = (from, to, label) => console.log(`  ${label.padEnd(50)} ${(at[to] - at[from]).toFixed(1).padStart(8)}ms`);
  console.log(`\ncpu=${cpu}x   first contentful paint at ${at['#fcp'].toFixed(0)}ms, load at ${at['#load'].toFixed(0)}ms`);
  span('#script-end', 'modules-done', 'module evaluation (the whole bundle)');
  span('validator-start', 'validator-end', 'createSeamValidator (ajv holds every master)');
  span('config-start', 'config-end', 'validating 21 configuration documents');
  span('config-end', 'construct-end', 'constructing the components');
  span('construct-end', 'subscribed', 'starting them (subscriptions only)');
  span('subscribed', 'provisioned', 'clock.start() -> the provisioning cascade');
  console.log('    of which the archive holding:');
  span('archive-start', 'archive-field-end', '      evaluating the field');
  span('archive-field-end', 'archive-digest-end', '      sha256 over the field bytes');
  span('archive-digest-end', 'archive-manifest-end', '      assembling the manifest');
  span('archive-manifest-end', 'archive-publish-end', '      store.publish (re-hash, then fan-out)');
  console.log('    of which the now-cast holding:');
  span('nowcast-start', 'nowcast-field-end', '      evaluating the field');
  span('nowcast-field-end', 'nowcast-digest-end', '      sha256 over the field bytes');
  span('nowcast-manifest-end', 'nowcast-publish-end', '      store.publish (re-hash, then fan-out)');
  span('backend-start', 'backend-end', 'buildBackend total');
  span('backend-end', 'render-end', 'rendering the shell over the starting frame');
  // Since main.tsx paints a starting frame before building the backend, FCP lands ahead
  // of everything above and is reported in the header rather than as a span. It used to
  // be the last thing that happened; a span from the shell's commit to FCP now comes out
  // negative, which is the change working rather than a fault.
} finally {
  await browser?.close();
  server?.close();
  for (const [file, source] of originals) writeFileSync(file, source);
}
