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
import { runGate as estateConcurrency } from '../gates/check-estate-concurrency.js';
import { completenessFindings } from '../../app/src/panels/operator/graph.js';
import type { ConfigRun, Topology } from '../../app/src/generated/types.js';
import { buildSite } from '../site/build.js';
import { runGate as backgroundInert } from '../gates/check-background-inert.js';
import { runGate as backgroundMarks } from '../gates/check-background-marks.js';
import { runGate as oneBreakpoint } from '../gates/check-one-breakpoint.js';
import { runGate as viewIds } from '../gates/check-view-ids.js';
import { runGate as truthInitialisation } from '../gates/check-truth-initialisation.js';
import { runGate as blogLength } from '../gates/check-blog-length.js';
import { runGate as replayMarkers, scan } from '../gates/check-replay-markers.js';
import { runGate as declaredCost } from '../gates/check-declared-cost.js';
import { runGate as captureInventory } from '../gates/check-capture-inventory.js';

const fixtures = join(REPO_ROOT, 'scripts', 'gates', 'tests', 'fixtures');
const violations = join(fixtures, 'violations');
const clean = join(fixtures, 'clean');

describe('each gate catches its planted violation and passes a clean tree', () => {
  it('replay-markers: an unmarked byte-identity test and a marker adrift both fail; the real tree passes', () => {
    // The fault this gate exists against, in the shape it actually took: `pnpm
    // replay-proof` selected with `-t replay`, the generator's byte-identity test
    // matched neither its own name nor its describe, and the proof printed "held"
    // over it. Selection by marker closes that; what it cannot close is a
    // byte-identity test written with no marker at all, which is planted here.
    const unclassified = replayMarkers(join(fixtures, 'replay-unclassified'));
    expect(unclassified.map((f) => f.message)).toEqual([
      expect.stringMatching(/reads as a determinism or replay claim and carries neither marker/),
    ]);
    expect(unclassified[0].message).toContain('replays byte-identically: one seed, one run, twice');
    // The exclusion marker is an answer, not a silence: the sibling carrying it is
    // not reported, and neither is the test whose name makes no such claim.
    expect(unclassified).toHaveLength(1);

    // The other half: a marker that has drifted off its test. The proof cannot say
    // which test it expects, so it refuses rather than guessing. Both facts are
    // reported, and deliberately: the marker is adrift *and* the test below it is
    // left unclassified, which are two different things to fix and would be two
    // different mistakes to make.
    const unreadable = replayMarkers(join(fixtures, 'replay-unreadable'));
    expect(unreadable.map((f) => f.message)).toEqual([
      expect.stringMatching(/is neither on nor directly above a test declaration/),
      expect.stringMatching(/reads as a determinism or replay claim and carries neither marker/),
    ]);

    expect(replayMarkers(REPO_ROOT)).toEqual([]);
  });

  it('replay-markers: a trailing marker marks its own test, not the next one', () => {
    // The fault the first version of this gate had, and the original fault's exact
    // shape: reading only the line *below* a marker meant a marker written as a
    // trailing comment marked the following test and let its own drop out of the
    // sweep unreported. Both halves failed at once, and silently.
    const root = join(fixtures, 'replay-trailing');
    expect(replayMarkers(root)).toEqual([]);
    const { marked } = scan(root);
    expect(marked.map((test) => test.name)).toEqual([
      'replays byte-identically: one seed, one run, twice',
    ]);
  });

  it('replay-markers: test() and a name on the next line are both swept', () => {
    // vitest exports `test` as well as `it`, and a multi-line call is ordinary
    // formatting. A per-line /\bit\(/ saw neither, so a byte-identity test written
    // either way sat outside the proof with nothing said — the silent direction.
    const found = replayMarkers(join(fixtures, 'replay-spellings'));
    expect(found).toHaveLength(2);
    expect(found[0].message).toContain('replays byte-identically via test()');
    expect(found[1].message).toContain('with the name on the next line');
  });

  it('replay-markers: prose quoting a test name is not a test', () => {
    // This repository's docblocks quote test names as a habit — check-replay-markers'
    // own header does. Reported as violations, the only escapes were to reword the
    // prose or to mark it, and marking it adds a test that does not exist to the
    // proof's expected set, which then fails for the wrong reason.
    expect(replayMarkers(join(fixtures, 'replay-prose'))).toEqual([]);
    expect(scan(join(fixtures, 'replay-prose')).marked).toEqual([]);
  });

  it('replay-markers: two marked tests sharing a name in one file is refused', () => {
    // The proof keys a pass by (file, leaf title) because vitest's title carries no
    // ancestor describe. Two marked tests with one title in one file would make a
    // pass for either indistinguishable from a skip of the other.
    const found = replayMarkers(join(fixtures, 'replay-duplicate'));
    expect(found.map((f) => f.message)).toEqual([
      expect.stringMatching(/both called "replays byte-identically"/),
    ]);
  });

  it('truth-initialisation: a component reaching for the true field fails; the real tree passes', () => {
    // The leak this feature closed: for nine features the model runner initialised
    // from a now-cast evaluated from the true ocean, so nothing the platform measured
    // ever changed a field value. Planted here as a component outside the permitted
    // four calling the accessor that hands back those bytes.
    const found = truthInitialisation(violations);
    expect(found.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/may not read the truth-derived now-cast/)]),
    );
    expect(found.some((f) => f.file.includes('model-runner'))).toBe(true);
    // Feature 121 added a second truth-derived accessor. One guarded and the other
    // open would have left this gate reporting clean on the same fault, so the brief
    // is planted too and the message is required to name which holding leaked.
    expect(found.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/may not read the truth-derived departure brief/)]),
    );
    expect(found.some((f) => f.file.includes('departure-initialisation'))).toBe(true);
    expect(truthInitialisation(clean)).toEqual([]);
  });

  it('declared-cost: a cost figure in another component’s document fails; the real tree passes', () => {
    // The fault class this repository keeps finding, in its newest form: a second copy of
    // a figure one component owns. A `run_cost_ticks` beside `min_interval_ticks` would let
    // the scheduler hold a run against one number while the run occupied another, and
    // neither document would be wrong on its own terms (FR-115, ADR-0043).
    const found = declaredCost(join(fixtures, 'declared-cost'));
    expect(found.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/declares 'run_cost_ticks'/)]),
    );
    // Both arms. The gate walks the configuration masters and the run document, and only
    // the first was planted against when it was written — the second's "no such file"
    // branch returns the findings it has, which is the shape that reports clean on a
    // missing bound. A cost in a component's own configuration is caught too.
    expect(found.some((finding) => finding.file.includes('config.scheduler'))).toBe(true);
    expect(found.some((finding) => finding.file.includes('run.json') && finding.message.includes("'planner'"))).toBe(true);
    // A topic naming where the cost is published is not a declaration of it: the scheduler
    // subscribes to `run_cost` in the real tree, and that is the design working.
    expect(declaredCost()).toEqual([]);
  });

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

  it('background-inert: every rule fires on the wired explainer (feature 111 FR-004)', () => {
    const messages = backgroundInert(violations).map((f) => f.message).join('\n');
    // Each rule named separately: a gate that has only ever been seen catching one of
    // its five rules has four rules nobody has watched.
    expect(messages).toMatch(/may not import 'seam'/);
    expect(messages).toMatch(/fetch\(\)/);
    expect(messages).toMatch(/a transport call/);
    expect(messages).toMatch(/a network connection/);
    expect(messages).toMatch(/reads no run state/);
    expect(backgroundInert(clean)).toEqual([]);
    // And the tree it is actually for: the course as committed is inert.
    expect(backgroundInert(REPO_ROOT)).toEqual([]);
  });

  it('background-marks: an explainer that authors its own colour fails (FR-011)', () => {
    const messages = backgroundMarks(violations).map((f) => f.message).join('\n');
    expect(messages).toMatch(/a colour literal/);
    expect(messages).toMatch(/a computed colour/);
    expect(messages).toMatch(/a paint literal/);
    expect(backgroundMarks(clean)).toEqual([]);
    expect(backgroundMarks(REPO_ROOT)).toEqual([]);
  });

  it('view-ids: a link to a view the configuration does not declare fails (FR-68, SC-06)', () => {
    // Three shapes, because a view is named in three ways, and a gate that caught only
    // the literal address would leave the helper and the registry to rot quietly.
    const messages = viewIds(join(fixtures, 'views-dangling')).map((f) => f.message).join('\n');
    expect(messages).toMatch(/names the view 'system'/);
    expect(messages).toMatch(/names the view 'gone'/);
    expect(messages).toMatch(/renders a panel for 'system'/);
    // And it leaves alone a declared view, a deep address below one, and prose about a
    // withdrawn address carrying its exemption — a gate paid for in exemptions would
    // stop meaning anything, and one that failed the record of its own reason would be
    // charging for the record.
    expect(viewIds(join(fixtures, 'views-dangling')).filter((f) => f.message.includes("'holdings'"))).toEqual([]);
    expect(viewIds(join(fixtures, 'views-declared'))).toEqual([]);
    // And the tree it is actually for.
    expect(viewIds(REPO_ROOT)).toEqual([]);
  });

  it('view-ids: a tree whose configuration declares no views is a failure, not a pass', () => {
    // `run-gates.ts`'s rule: the outcome that proves nothing must not look like a pass.
    expect(() => viewIds(join(fixtures, 'site-broken'))).toThrow(/which views exist/);
  });

  it('one-breakpoint: a stylesheet switching at a width the shell does not fails (FR-002)', () => {
    // Both halves matter. The gate has to catch a second number — the drift it exists
    // for — and it has to leave alone a breakpoint that carries the declared threshold
    // and one that is exempted with its reason. A gate that failed the clean tree would
    // be paid for in exemptions until it meant nothing.
    const messages = oneBreakpoint(violations).map((f) => f.message).join('\n');
    expect(messages).toMatch(/a breakpoint at 640px/);
    expect(messages).toMatch(/a breakpoint at 900px/);
    expect(messages).toMatch(/the one threshold is 720px/);
    expect(oneBreakpoint(clean)).toEqual([]);
    // And the tree it is actually for.
    expect(oneBreakpoint(REPO_ROOT)).toEqual([]);
  });

  it('blog-length: a long entry and a long description both fail; a short one passes', () => {
    const messages = blogLength(violations).map((f) => f.message).join('\n');
    expect(messages).toMatch(/runs to 90 words of prose; the budget is 40/);
    expect(messages).toMatch(/description runs to 30 words; the index card takes 12/);
    // The clean fixture's alt text alone is longer than that tree's whole budget, so a
    // pass there is what says the exemption for alt text and URLs is real rather than
    // merely intended — and what would catch a counter that stopped exempting them.
    expect(blogLength(clean)).toEqual([]);
    // And the tree it is actually for: every published entry is inside the budget.
    expect(blogLength(REPO_ROOT)).toEqual([]);
  });

  it('blog-length: reports rather than passes when the note states no budget', () => {
    // The outcome that proves nothing must not look like a pass (run-gates.ts).
    expect(() => blogLength(join(fixtures, 'stale-generated'))).toThrow(/word budget/);
  });

  it('one-breakpoint: reports rather than passes when the declaration is missing', () => {
    // The outcome that proves nothing must not look like a pass (run-gates.ts). A tree
    // with no NARROW_WIDTH is a tree this gate cannot check, and it says so.
    expect(() => oneBreakpoint(join(fixtures, 'stale-generated'))).toThrow(/NARROW_WIDTH/);
  });

  it('topology-drift: a stale committed artefact fails; the real one passes', () => {
    const stale = topologyDrift(REPO_ROOT, join(fixtures, 'stale-topology.json'));
    expect(stale.map((f) => f.message).join('\n')).toMatch(/drifted/);
    expect(topologyDrift(REPO_ROOT)).toEqual([]);
  });

  it('flow-completeness: an undrawn component, a drawn stranger and an unheard topic all fail; the real tree passes', () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, 'app', 'config', 'run.json'), 'utf8'),
    ) as ConfigRun;
    const topology = JSON.parse(
      readFileSync(join(REPO_ROOT, 'contracts', 'topology.json'), 'utf8'),
    ) as Topology;
    // The tree as it stands draws everything it should.
    expect(completenessFindings(config.shell, topology)).toEqual([]);

    // A component that runs and is not drawn.
    const undrawn = structuredClone(config.shell);
    undrawn.components = undrawn.components.filter((component) => component.id !== 'platform');
    expect(completenessFindings(undrawn, topology).join('\n')).toMatch(
      /component 'platform' runs in the topology but has no node/,
    );

    // A node for something that has never existed — Constitution VII, applied to the
    // diagram. This is the shape the adaptive sampler was deliberately NOT given.
    const stranger = structuredClone(config.shell);
    stranger.components = [
      ...stranger.components,
      { id: 'adaptive-sampling', label: 'Adaptive sampling', beat: 112, band: 'downstream', rank: 9 },
    ];
    expect(completenessFindings(stranger, topology).join('\n')).toMatch(
      /draws 'adaptive-sampling', which the topology does not know/,
    );

    // Two nodes claiming one place, and a port edge naming a stranger.
    const collided = structuredClone(config.shell);
    collided.components = collided.components.map((component) =>
      component.id === 'sensors' ? { ...component, rank: 0 } : component,
    );
    collided.flow.ports = [
      ...collided.flow.ports,
      { from: 'adaptive-sampling', to: 'platform', label: 'a component that does not exist' },
    ];
    const collidedFindings = completenessFindings(collided, topology).join('\n');
    expect(collidedFindings).toMatch(/both declare path:0/);
    expect(collidedFindings).toMatch(/port edge names 'adaptive-sampling'/);

    // A topic nothing in the picture hears. The first version of this gate counted
    // every topic it looked at, so a planted one sailed past — a list that counts
    // everything can never report anything missing.
    const deaf = structuredClone(topology) as Topology;
    deaf.topics = [
      ...deaf.topics,
      {
        topic: 'ctl/telemetry/digest',
        namespace: 'ctl',
        schema: null,
        publishers: ['telemetry'],
        subscribers: [],
        named_by: [],
      },
    ];
    expect(completenessFindings(config.shell, deaf).join('\n')).toMatch(
      /topic 'ctl\/telemetry\/digest' is published by telemetry and nothing in the picture hears it/,
    );
  });

  it('estate-concurrency: two workflows sharing a group fail; distinct groups pass', () => {
    const shared = estateConcurrency(join(fixtures, 'workflows-shared'));
    // Both sharers are named, because either one is the one that gets cancelled.
    expect(shared.map((f) => f.file).sort()).toEqual([
      '.github/workflows/frequent.yml',
      '.github/workflows/rare.yml',
    ]);
    expect(shared.map((f) => f.message).join('\n')).toMatch(/gh-pages-estate/);
    expect(estateConcurrency(join(fixtures, 'workflows-distinct'))).toEqual([]);
    // And the tree this runs in, whose shared group cost the V2 site its publication.
    expect(estateConcurrency(REPO_ROOT)).toEqual([]);
  });

  it('types-drift: a stale committed tree fails; the real one passes', () => {
    const stale = typesDrift(REPO_ROOT, join(fixtures, 'stale-generated'));
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.map((f) => f.message).join('\n')).toMatch(/drifted|missing/);
    expect(typesDrift(REPO_ROOT)).toEqual([]);
  });
  it('capture-inventory: the record and the workflow are held together, in every spelling of a step', () => {
    // **The fixtures are two spellings this gate's first pattern could not see**, and they are
    // here because it was declared working after three plants of a third spelling. A gate whose
    // own regex is narrower than the thing it holds has never been in a position to fail, which
    // is the fault it was written about, one level down.
    //
    // `run: pnpm capture:widgets` — no `run` verb, which is the form CLAUDE.md's own commands
    // table uses and therefore the one a contributor copies.
    const bare = captureInventory(join(fixtures, 'capture-bare-pnpm')).map((finding) => finding.message);
    expect(bare).toEqual([
      expect.stringMatching(/CI runs capture:widgets and this list does not name it/),
      expect.stringMatching(/says two capture proofs; CI runs 3/),
    ]);

    // A digit in the name: `capture:map2` matched as `capture:map` under `[a-z-]+`, so a step
    // running a script that does not exist passed the name check *and* the count.
    const digits = captureInventory(join(fixtures, 'capture-digit-suffix')).map((finding) => finding.message);
    expect(digits).toEqual([
      expect.stringMatching(/CI runs capture:map2 and package.json defines no such script/),
      expect.stringMatching(/CI runs capture:map2 and this list does not name it/),
      expect.stringMatching(/this list names capture:map and .*ci\.yml does not run it/),
    ]);

    // The number stated in prose beside the list is a second place for the same fact to be wrong.
    expect(captureInventory(join(fixtures, 'capture-count')).map((finding) => finding.message)).toEqual([
      expect.stringMatching(/says three capture proofs; CI runs 2/),
    ]);

    // **And there are two such numbers**, four words apart in one paragraph: the captures, and
    // the total including `replay-proof`. The gate held the second and not the first, and the
    // first was wrong the day it was written — "seven more things" against eight.
    expect(captureInventory(join(fixtures, 'capture-total')).map((finding) => finding.message)).toEqual([
      expect.stringMatching(/says CI runs five more things.*it runs 3 — 2 captures and replay-proof/),
    ]);

    // **Every form of the command, not the one the workflow happens to use.** Anchored on `run:`
    // the pattern could not see a multi-line `run: |` block (`|` is not whitespace) nor
    // `pnpm -C app run capture:x` (`-C app` sits between `pnpm` and `run`) — both ordinary YAML,
    // both adding a proof the record does not name while the gate reported clean.
    expect(captureInventory(join(fixtures, 'capture-block')).map((finding) => finding.message)).toEqual([
      expect.stringMatching(/CI runs capture:widgets and this list does not name it/),
      expect.stringMatching(/says CI runs three more things.*it runs 4/),
      expect.stringMatching(/says two capture proofs; CI runs 3/),
    ]);

    // **One proof run at two views is one proof.** The record names commands and the workflow
    // runs steps; counting steps made an honest record red — seven names against eight steps,
    // fixable only by writing "eight" over a list of seven. `capture:glance` already takes a view
    // argument, so a second such step is a plausible next change rather than a hypothetical.
    expect(captureInventory(join(fixtures, 'capture-twice'))).toEqual([]);

    // And a record that has lost the sentence entirely is a refusal, not a pass: a gate that
    // cannot find what it holds has proved nothing.
    expect(() => captureInventory(join(fixtures, 'capture-unnamed'))).toThrow(/no longer carries the sentence/);

    // The real tree agrees with itself.
    expect(captureInventory()).toEqual([]);
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
