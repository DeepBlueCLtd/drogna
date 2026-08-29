/**
 * Every gate is watched failing before it is trusted: each is run here against a
 * fixture tree carrying exactly the violation it exists to catch, and against a
 * clean tree. A gate that stops matching looks exactly like a clean run — these
 * tests are what tells those two silences apart (CLAUDE.md, the one habit).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../gates/lib.js';
import { runGate as wallclock } from '../gates/check-wallclock.js';
import { runGate as seededRng } from '../gates/check-seeded-rng.js';
import { runGate as literalPaths } from '../gates/check-literal-paths.js';
import { runGate as vocabulary } from '../gates/check-vocabulary.js';
import { runGate as importBoundary } from '../gates/check-import-boundary.js';
import { runGate as typesDrift } from '../gates/check-types-drift.js';
import { runGate as topologyDrift } from '../gates/check-topology-drift.js';
import { runGate as siteLinks } from '../gates/check-site-links.js';
import { runGate as siteResources } from '../gates/check-site-resources.js';
import { inspect as publication } from '../gates/check-site-publication.js';
import { runGate as siteDisclosure } from '../gates/check-site-disclosure.js';
import { buildSite } from '../site/build.js';

const fixtures = join(REPO_ROOT, 'scripts', 'gates', 'tests', 'fixtures');
const violations = join(fixtures, 'violations');
const clean = join(fixtures, 'clean');

describe('each gate catches its planted violation and passes a clean tree', () => {
  it('wallclock', () => {
    const found = wallclock(violations);
    expect(found.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Date\.now/), expect.stringMatching(/setTimeout/)]),
    );
    expect(wallclock(clean)).toEqual([]);
  });

  it('seeded-rng', () => {
    expect(seededRng(violations).map((f) => f.message)).toEqual([
      expect.stringMatching(/Math\.random/),
    ]);
    expect(seededRng(clean)).toEqual([]);
  });

  it('literal-paths', () => {
    const messages = literalPaths(violations).map((f) => f.message);
    expect(messages).toHaveLength(3);
    expect(messages.join('\n')).toMatch(/topic string/);
    expect(messages.join('\n')).toMatch(/seam path/);
    expect(messages.join('\n')).toMatch(/absolute URL/);
    expect(literalPaths(clean)).toEqual([]);
  });

  it('vocabulary', () => {
    const messages = vocabulary(violations).map((f) => f.message);
    // harness:allow-forbidden-vocabulary asserting the gate names the word it caught
    expect(messages.join('\n')).toMatch(/'contact'/);
    // harness:allow-forbidden-vocabulary asserting the gate names the word it caught
    expect(messages.join('\n')).toMatch(/'detection'/);
    expect(vocabulary(clean)).toEqual([]);
  });

  it('import-boundary', () => {
    const found = importBoundary(violations);
    expect(found.map((f) => f.message)).toEqual([
      "'panels' may not import from 'backend' (Constitution XI)",
    ]);
    expect(importBoundary(clean)).toEqual([]);
  });

  it('topology-drift: a stale committed artefact fails; the real one passes', () => {
    const stale = topologyDrift(REPO_ROOT, join(fixtures, 'stale-topology.json'));
    expect(stale.map((f) => f.message).join('\n')).toMatch(/drifted/);
    expect(topologyDrift(REPO_ROOT)).toEqual([]);
  });

  it('types-drift: a stale committed tree fails; the real one passes', () => {
    const stale = typesDrift(REPO_ROOT, join(fixtures, 'stale-generated'));
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.map((f) => f.message).join('\n')).toMatch(/drifted|missing/);
    expect(typesDrift(REPO_ROOT)).toEqual([]);
  });
});

describe('the site gates catch their planted violations and pass the real site', () => {
  const fixtureSite = (name: string): string => join(fixtures, name);

  it('site-links: a broken link, a broken anchor and an absolute link', () => {
    const messages = siteLinks(REPO_ROOT, fixtureSite('site-broken')).map((f) => f.message);
    expect(messages.join('\n')).toMatch(/page that does not exist: nowhere\.md/);
    expect(messages.join('\n')).toMatch(/heading that does not exist: present\.md#no-such-heading/);
    expect(messages.join('\n')).toMatch(/absolute link '\/absolute\/path\/'/);
    expect(siteLinks(REPO_ROOT)).toEqual([]);
  });

  it('site-resources: a fetched image and a fetched script, but not a hyperlink', () => {
    const messages = siteResources(REPO_ROOT, fixtureSite('site-external')).map((f) => f.message);
    expect(messages.join('\n')).toMatch(/a-picture\.png/);
    expect(messages.join('\n')).toMatch(/a-script\.js/);
    // The hyperlink to the standards document is a link, not a fetch, and is allowed.
    expect(messages.join('\n')).not.toMatch(/docs\.ogc\.org/);
    expect(siteResources(REPO_ROOT)).toEqual([]);
  });

  it('site-disclosure: an email address and a home directory pasted into a page', () => {
    const messages = siteDisclosure(REPO_ROOT, fixtureSite('site-disclosed')).map((f) => f.message);
    expect(messages.join('\n')).toMatch(/someone@example\.invalid/);
    expect(messages.join('\n')).toMatch(/\/home\/someone/);
    expect(siteDisclosure(REPO_ROOT)).toEqual([]);
  });

  it('site-publication: the statement, the noindex declaration and the two files', () => {
    const real = buildSite(REPO_ROOT).files;
    expect(publication(real)).toEqual([]);

    const withoutStatement = real.map((file) =>
      file.path === 'index.html'
        ? { path: file.path, contents: String(file.contents).replace(/deliberately fake/gi, 'entirely reliable') }
        : file,
    );
    expect(publication(withoutStatement).map((f) => f.message).join('\n')).toMatch(/does not state/);

    const withoutNoindex = real.map((file) =>
      file.path === 'glossary/index.html'
        ? { path: file.path, contents: String(file.contents).replace(/noindex, nofollow/, 'all') }
        : file,
    );
    expect(publication(withoutNoindex).map((f) => f.message).join('\n')).toMatch(/does not decline indexing/);

    expect(publication(real.filter((file) => file.path !== 'robots.txt')).map((f) => f.message).join('\n')).toMatch(
      /robots\.txt is missing/,
    );
    expect(publication(real.filter((file) => file.path !== '.nojekyll')).map((f) => f.message).join('\n')).toMatch(
      /\.nojekyll is missing/,
    );

    // A page that says it is a stub is a stub, whatever its length — V1's five
    // self-declared stubs were all longer than the shortest page it had accepted.
    const withStub = real.map((file) =>
      file.path === 'glossary/index.html'
        ? { path: file.path, contents: `${String(file.contents)}<p>Stub — not yet written.</p>` }
        : file,
    );
    expect(publication(withStub).map((f) => f.message).join('\n')).toMatch(/declares itself a stub/);
  });

  it('the statement has to be above the first section heading, not merely present', () => {
    const real = buildSite(REPO_ROOT).files;
    const moved = real.map((file) => {
      if (file.path !== 'index.html') return file;
      const text = String(file.contents);
      const opening = text.indexOf('<main');
      const firstSection = text.indexOf('<h2');
      // The statement is cut out of the opening and pasted back below the first
      // heading: every word still on the page, none of it where a reader starts.
      const head = text.slice(0, opening);
      const statement = text.slice(opening, firstSection);
      const rest = text.slice(firstSection);
      return { path: file.path, contents: `${head}<main id="content" class="content">${rest}${statement}` };
    });
    expect(publication(moved).map((f) => f.message).join('\n')).toMatch(/does not state/);
  });
});

describe('the registry', () => {
  const registry = readFileSync(join(REPO_ROOT, 'scripts', 'gates.registry'), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  it('carries every check-* script: an unregistered gate is a gate that never runs', () => {
    const onDisk = readdirSync(join(REPO_ROOT, 'scripts', 'gates'))
      .filter((name) => name.startsWith('check-') && name.endsWith('.ts'))
      .map((name) => `gates/${name}`);
    for (const gate of onDisk) expect(registry).toContain(gate);
  });

  it('names only files that exist', () => {
    for (const entry of registry) {
      expect(() => readFileSync(join(REPO_ROOT, 'scripts', entry))).not.toThrow();
    }
  });
});

describe('the runner', () => {
  it('reports a failing gate and a gate that could not run, and exits nonzero', () => {
    let stdout = '';
    let failed = false;
    try {
      stdout = execFileSync('pnpm', ['exec', 'tsx', 'scripts/run-gates.ts'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DROGNA_GATES_REGISTRY: join(fixtures, 'runner.registry'),
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (fault) {
      failed = true;
      const error = fault as { status: number; stdout: string; stderr: string };
      expect(error.status).toBe(1);
      expect(error.stderr).toMatch(/always fails, by design/);
      expect(error.stderr).toMatch(/could not run/);
    }
    expect(failed, `the runner exited 0 against a failing registry; stdout:\n${stdout}`).toBe(true);
  });
});
