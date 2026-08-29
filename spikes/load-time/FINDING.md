# Finding: where the ten seconds before the shell appears actually go

**Date**: 29 August 2026
**Status**: answered, and acted on — §5.1 and §5.3 are implemented, §5.2 was tried and
abandoned on the measurement. **§7 is written after the fact and corrects §5 in three
places; read it before acting on anything above it.**
**Question**: a first load of a published instance takes about ten seconds. Where does
that time go, and what is worth doing about it?

---

## The result in one paragraph

The wait is two roughly equal halves, and only one of them is the bundle. The browser
must fetch **1.97 MB of JavaScript in a single chunk (546 kB gzipped)** before anything
at all can run, and then it must get through **about two seconds of synchronous boot on
a mid-range laptop** before the first pixel of the shell is painted — because
`boot()` validates, constructs, provisions and renders the entire harness in one
unbroken task, and nothing paints until it returns. On a developer's machine at full
speed that boot is 300 ms and invisible; at Chromium's 4× throttle it is 1.4 s and at 6×
it is 2.1 s. The largest single item in it is not the bundle and not React: it is
**provisioning the 20-year archive holding**, 115,200 cells evaluated and then SHA-256'd
twice in hand-written JavaScript, 824 ms at 4×. The second largest is **Ajv compiling
49 JSON Schema masters in the browser**, 647 ms at 4×, every millisecond of which is
work a build step could have done once. Neither needs a design change to fix. The three
recommendations in §5 are, in order: move the map's 711 kB off the critical path (a
patch is in this directory, and it is worth a measured 1.6 s on a slow line), precompile
the validators at build time under the existing `pnpm generate` chain, and let the shell
paint one frame before the backend boots. None of them touches the seam, the determinism
claim, or what the demo holds. Only the first has been measured: the second is a
projection from the 647 ms the Ajv phases cost today, and the third removes nothing at
all — it moves about 1.2 s of the wait behind a frame that shows the harness starting,
which is a different and cheaper kind of fix. Together they should more than halve the
dark screen, and the honest way to find out is to do the first, publish an instance, and
measure it again.

## Method

Measured against `app/dist` served over gzip from localhost, not against the live
estate: Chromium here could not reach `deepbluecltd.github.io` through the environment's
proxy, so the network half is **modelled rather than observed** — Chromium's own
throttling at three named lines — and the CPU half is measured directly. That is the
honest division and §4 says what it means for the ten-second figure.

The scripts are in this directory and every number below came out of one of them:

| Script | What it answers |
|---|---|
| `serve.mjs` | serves `app/dist` **gzipped**, as GitHub Pages does |
| `measure.mjs` | first-load timings at a named CPU multiplier and line |
| `phases.mjs` | the boot second, phase by phase |
| `bundle.mjs` | which package contributed which bytes to the chunk |
| `prototype-lazy-map.patch` | the §5.1 change, as measured |

`phases.mjs` needs marks that cannot live in `app/src` — `performance.mark` is host time
in operational code, and a build carrying them is not the build anybody loads — so it
edits four files, builds, measures and restores them in a `finally`. Both of its guards
were watched failing before the numbers below were trusted: a deliberately broken anchor
stopped the run and left `app/src` clean, and a scratch edit to an unrelated file made
it refuse to start. Without the first guard a renamed anchor would have reported its
phase as `0.0ms` rather than as an error, which is the failure this spike would have
been least likely to notice.

Raw output is under `results/`.

## 1. What the ten seconds is made of

`SHELL-USABLE` is navigation start to the moment `#root` holds real content. First
contentful paint lands within about 200 ms of it, because **nothing paints before the
boot finishes** — the shell has no loading state, and its first frame is its finished
frame.

From `results/first-load.txt`:

| Machine | Line | first paint | FCP | shell usable | main thread blocked |
|---|---|---:|---:|---:|---:|
| 1× (this container) | localhost | 88 ms | 568 ms | **594 ms** | 399 ms |
| 4× (mid-range laptop) | 9 Mbps / 40 ms | 200 ms | 2488 ms | **2600 ms** | 2012 ms |
| 4× | 4 Mbps / 80 ms | 260 ms | 3224 ms | **3336 ms** | 2085 ms |
| 6× (low-end laptop) | 1.6 Mbps / 150 ms | 488 ms | 6388 ms | **6619 ms** | 3784 ms |

The "first paint" column is the `#10151b` background from the inline style in
`index.html`, which is the only thing the page can show on its own. Everything between
that and FCP is dark screen.

## 2. The bundle: one chunk, and a third of it is the map

`app/dist/assets/index-*.js` is **1,968 kB, 546 kB gzipped, and there is exactly one of
them**. Vite has been printing the chunk-size warning on every build. From
`results/bundle.txt` (per-module, pre-minification, so these sum to about twice the
emitted chunk — read the proportions rather than the bytes):

| | bytes | needed to show |
|---|---:|---|
| `deck.gl` + `luma.gl` + `math.gl` + `loaders.gl` + `mjolnir.js` + `probe.gl` + `earcut` | ~1,788 k | the map view, and nothing else |
| `dockview-core` + `dockview-react` | 773 k | any view |
| `h3-js` | 494 k | the map view **and** the planner's uncertainty grid |
| `src/generated` (49 schema masters, 259 kB of JSON, plus types) | 322 k | validation |
| `ajv` + `ajv-formats` + `fast-uri` | 323 k | validation |
| `react-dom` + `react` + `scheduler` | 149 k | any view |
| `src/backend` + `src/panels` + `src/shell` | 256 k | the harness itself |

Those are module bytes, not emitted bytes; the figure that matters is what actually
separates out, and §5.1 measures it: **711 kB of the emitted 1,968 kB — 206 kB of the
546 kB gzipped — is reachable only from the map.** A little over a third of what every
visitor waits for, for one of six views, and not the one the front door opens on
(`config.views[0]` is the intro). `Shell.tsx` imports all six panels statically, so there
is no seam here to argue about: it is an import graph, not a design.

## 3. The boot second, phase by phase

From `results/boot-phases.txt`. The 4× column is the one to read; 1× is the machine this
was measured on and is not the machine anybody watches the demo on.

| Phase | 1× | **4×** | 6× |
|---|---:|---:|---:|
| module evaluation (the whole bundle) | 71 | **215** | 243 |
| `createSeamValidator` — Ajv takes all 49 masters | 55 | **257** | 413 |
| validating the 21 configuration documents | 102 | **390** | 818 |
| constructing the components | 10 | **35** | 57 |
| starting them (subscriptions only) | 1 | **9** | 11 |
| `clock.start()` → the provisioning cascade | 186 | **824** | 1211 |
| — archive: evaluating the field | 80 | **339** | 519 |
| — archive: SHA-256 over the field bytes | 39 | **175** | 238 |
| — archive: `store.publish` (re-hash, then fan-out) | 34 | **163** | 229 |
| — now-cast: field, hash and publish | 19 | **87** | 126 |
| React commit → first contentful paint | 55 | **219** | 141 |
| **`buildBackend` total** | **300** | **1261** | **2101** |

Three things in that table are worth naming.

**The archive is 115,200 cells and the now-cast is 11,520.** `config/run.json` asks for
240 months of history on a 12 × 10 × 4 grid; the now-cast is four time steps on a
24 × 20 × 6 grid. The archive is ten times the work and it is all done before the first
paint, on the clock's first sample, because that is where FR-11 puts it.

**The same 921,600 bytes are SHA-256'd twice.** `evaluateAndPublish` hashes the field to
fill in the descriptor's digest, and `CoverageStore.publish` hashes it again to verify
that digest — which is the entire point of the staged-publication seam (FR-13) and must
not be removed. But both passes run through `backend/lib/sha256.ts`, which is
hand-written JavaScript, deliberately so, because `crypto.subtle` is async-only and
these call sites are synchronous. That choice is documented in the file and was cheap
when the digests were configuration documents. Against 1.8 MB of field bytes the two
passes cost roughly 340 ms at 4×: 175 ms measured directly as the generator's pass, and
the bulk of the 163 ms `store.publish` segment, which also carries the fan-out and was
not split further.

**Ajv compiles 49 schemas in the browser on every visit.** `createSeamValidator` hands
Ajv every master (257 ms at 4×), and then `buildBackend` immediately calls
`ajv.getSchema` for 21 configuration masters, each of which *compiles* that schema to a
JavaScript function on first use (390 ms at 4×). The validation itself is trivial — the
documents are small. It is the compilation that costs, and it produces the identical
functions on every load of every instance.

## 4. About the ten seconds

The worst case measured here is 6.6 s, at 6× CPU over a modelled 1.6 Mbps line with
**zero** real network latency and a warm TCP connection to localhost. A real first load
adds DNS, TLS and GitHub Pages' round trips on top of that; the JavaScript asset alone
takes 320 ms to fetch from this datacentre with no throttling at all. Ten seconds on a
real machine over a real connection is consistent with what is measured, and this spike
did not reproduce it directly. Anyone who can point a browser at
`https://deepbluecltd.github.io/drogna/instances/main/` should run `measure.mjs` against
that URL and replace this paragraph with an observation.

Two things about the estate are worth recording while they are in view. GitHub Pages
serves these assets **gzipped, not brotli**, and sets `cache-control: max-age=600` with
no way to configure it — but it does send an `ETag`, and the chunk filenames are content
hashed, so a second visit after ten minutes pays one revalidation round trip rather than
546 kB. **The ten seconds is a cold-load figure and repeat visits are not this slow**,
which is exactly why it is easy for it to go unnoticed by the people who look at
instances most often.

## 5. What to do, in the order worth doing it

### 5.1 Take the map's 711 kB off the critical path

Load `MapPanel` with `React.lazy` and a dynamic import. `prototype-lazy-map.patch` in
this directory is the whole change — fifteen lines in `Shell.tsx` — and it splits the
build into a 1,256 kB initial chunk (340 kB gzipped) and a 711 kB `MapPanel` chunk
(206 kB) fetched when the map is first shown. Measured, from
`results/first-load-lazy-map.txt`:

| Machine | Line | shell usable, before | after |
|---|---|---:|---:|
| 4× | 9 Mbps | 2600 ms | 2598 ms |
| 4× | 4 Mbps | 3336 ms | **2843 ms** |
| 6× | 1.6 Mbps | 6619 ms | **5000 ms** |

The win is entirely on the network axis, which is precisely where the slow loads are: on
a fast line the boot is the bottleneck and this changes nothing, and the table says so
rather than hiding it.

Two things the prototype does not settle, and which the real change should. The map is
one of the tabs dockview opens at first run, so its chunk is requested moments after the
shell paints rather than on demand — the shell paints first either way, but making the
fetch genuinely lazy means mounting only the active panel, which is a change to how
dockview is configured and deserves its own look. And `h3-js` stays in the initial chunk
at 494 kB, because `backend/planner` uses it as well as the map; the planner's use is
worth a separate look, because a backend component that pulls half a megabyte of
geospatial index into the first paint is a stronger reason to move it than the map is.

> **Acted on, and two of the three below were wrong about why.** §5.1 and §5.3 are
> implemented and measured; §5.2 was attempted and abandoned on the measurement. What
> changed, and what the numbers said when it was tried, is in §7 — read that before
> trusting the three subsections it follows, which are left as written so the corrections
> have something to correct.

### 5.2 Precompile the validators, under the chain that already exists

Ajv's `standalone` mode emits plain JavaScript validation functions from a schema at
build time. Doing that for the 49 masters should remove **most of the 647 ms** the two
Ajv phases cost at 4×, and take `ajv` + `ajv-formats` + `fast-uri` (323 kB of modules)
and most of the 301 kB `schema-documents.ts` out of the bundle with it.

This fits the existing machinery exactly and should not be invented separately from it.
The masters under `contracts/schemas/` are already the source of truth; `pnpm generate`
already writes into `app/src/generated/`; the drift gate already fails the build when
the committed output no longer matches a fresh generation. Precompiled validators are
one more generated artifact under the same rule — which is what Constitution III asks
for, not an exception to it. Validation itself is unchanged and still happens at
construction before any other work, so Principle IV is untouched; what moves is only
*when the validator is compiled*.

The one thing to check before committing to it: the seam validator addresses `$defs`
entries by key (`edr-collections#collections`), and standalone mode compiles a named
entry point per schema. Confirm every key `createSeamValidator` can be asked for has a
compiled counterpart, and keep the "no master named X" refusal path working, before
this is more than a plan.

### 5.3 Let the shell paint before the backend boots

`main.tsx` runs `createSeamValidator`, `buildBackend` and `root.render` in one
synchronous stretch at the end of module evaluation, so the whole 1.3 s at 4× is a
single task with no frame in it. Rendering the shell first — a frame that says the
harness is starting — and booting the backend in a subsequent task would put something
on screen at roughly the module-evaluation mark, about 1.2 s earlier at 4×, without
making the boot itself any faster.

This is a change to *when* the work happens and not to its order, which is what keeps it
safe: the backend's construction sequence, the clock's first sample and the provisioning
cascade all stay exactly as they are, so AT-04's byte-identical replay claim is
unaffected. Two constraints to respect. Yielding to the browser means a host-time
primitive, which the wall-clock gate refuses without a reviewed
`// harness:allow-wallclock` marker — this is a render-path deferral in the class ADR-0007
already covers, and it needs the marker and the reason, not a workaround. And the shim
in `installSeamFetch` already answers 503 while `runtime` is undefined, so the seam is
honest during the gap by construction; the shell needs a state that shows it rather than
a blank panel.

### 5.4 Considered, and worth doing only after the above

- **Hash the field bytes with `crypto.subtle`.** Native SHA-256 would turn that ~340 ms
  into single digits, but the two call sites are synchronous by design and making
  publication async reaches into the store's write seam. Worth it only if §5.1–5.3 leave
  the boot still visibly slow.
- **Shorten the archive.** `archive.months: 240` is configuration, not code, and the
  cost is linear: halving it saves roughly 170 ms of field evaluation and 170 ms of
  hashing at 4×. It is the cheapest edit in this document and the only one that changes
  what the demo holds, so it is a question for whoever wants twenty years of history,
  not a performance decision to take quietly.
- **Provision the archive off the first paint.** Tempting and not recommended: the
  holding's manifest records `generated_at` from the clock sample that triggered it, so
  moving provisioning to a later tick changes the bytes a replay must reproduce. The
  gain is already available from §5.3 without touching the ordering at all.
- **A service worker over the estate.** It would defeat the 600-second `cache-control`
  that GitHub Pages imposes and make repeat loads instant. But repeat loads are already
  cheap, the cold load is the complaint, and `spikes/service-worker` has the V1 record of
  what one costs to own. Not now.

## 6. What this spike did not measure

- A real first load of the published estate, for the proxy reason in §4. The network
  column is Chromium's model, not an observation.
- Anything after the shell appears: whether the first now-cast, the map's first frame or
  the forecast loop's first pass are fast enough is a different question and this spike
  says nothing about them.
- Memory, which never came up.
- Whether `dockview-core`'s 773 kB can be reduced. It was not looked at, because unlike
  the map it is needed by every view, and stating it as unmeasured is more useful than
  guessing.

---

## 7. What was done, and where §5 was wrong

Written after implementing §5.1 and §5.3 and abandoning §5.2. The numbers below are on the
merged tree — `main` had gained the Background tab, which took the bundle from 1,968 kB to
2,076 kB before any of this — so they do not line up exactly with §1's.

### The result

From `results/first-load-after.txt`, against §1's table:

| Machine / line | first contentful paint, before | after | shell usable, before | after |
|---|---:|---:|---:|---:|
| 1× / localhost | 568 ms | **140 ms** | 594 ms | 551 ms |
| 4× / 9 Mbps | 2488 ms | **588 ms** | 2600 ms | 2374 ms |
| 4× / 4 Mbps | 3224 ms | **1080 ms** | 3336 ms | 2893 ms |
| 6× / 1.6 Mbps | 6388 ms | **2400 ms** | 6619 ms | 5177 ms |

Something appears in a quarter to a third of the time it used to, and on localhost the
boot phases put first paint at 240 ms at 4× and 300 ms at 6× — against 2060 ms and 3024 ms
in §3's table.

**One number here is an observation of the published estate rather than a model**, which
is the first in this document and closes part of §4's and §6's caveat. GitHub Pages was
asked for both instances' entry chunks over gzip, as a browser would receive them:

| Deployed instance | initial chunk, as served |
|---|---:|
| `instances/main/` | 580,191 bytes gzipped |
| `instances/claude-website-load-time-qqzuil/` | **373,084 bytes gzipped** |

A 36% cut in what every visitor must have before anything can run, on the real artifacts
at the real addresses. The map's chunk is absent from the entry document, as a dynamic
import should be. What still has not been observed is the *timing* of a real first load,
because a browser here cannot reach the estate; the bytes could be counted with `curl`,
and were.

Full interactivity moved much less. `buildBackend` still costs ~1.38 s at 4× and ~2.09 s at
6×, so the shell is usable at roughly 2.4–5.2 s depending on the line. **The wait was not
removed so much as taken out from behind a blank page** — which is the honest description
of §5.3 and worth saying plainly. What remains is §5.2's territory and §5.4's, and neither
has been solved.

### §5.1 was right, and incomplete

Splitting the map out took the initial chunk from 2,076 kB to 1,364 kB (574 → 369 kB
gzipped). But `React.lazy` alone does nothing here, and §5.1 half-guessed this in its own
last paragraph: dockview mounts every panel's React tree at once — detached, as
`panels/map/attach.ts` already recorded — so a mounted lazy component fetches its chunk
immediately anyway. It needs the second half: `WhenFirstActive` withholds the render until
the tab is first selected. The prototype patch measured in §5.1 therefore measured the
weaker of the two changes.

### §5.3 was right, and the reason it works is not the one given

§5.3 said to render the shell first and boot after. That is what happens, but the yield is
not the interesting part — `flushSync` is. `root.render` only *schedules* in React 18, so
the first attempt left the starting frame uncommitted when the two animation frames
expired, the browser painted nothing new, and **FCP did not move at all** (2276 ms against
a 2488 ms baseline: noise). Forcing the commit is what turns a dark screen into a visible
one. A reader following §5.3 as written would have built the version that does not work.

### §5.2 was wrong, and is not done

Three measurements killed it, in order.

**Precompiling everything is worse than the problem.** All 131 addressable keys — 48 root
masters plus 82 `$defs` entries, all of which compile — emit **2,088,399 bytes** of
standalone validator code. That is larger than the entire bundle it was meant to shrink.

**The 21 config validations are one compilation, not 21.** `config.run` `$ref`s all twenty
component configs, so compiling it compiles the tree; the twenty `getSchema` calls after it
are cache hits at 0.0 ms each. Timed individually: `config.run` 134.1 ms, every other key
0.0 ms. So there was no redundancy to remove, and precompiling just `config.run` still
emits 518 kB raw / 48 kB gzipped, because it inlines the whole closure.

**And it does not run.** Wired up as a probe, the page died on `ReferenceError: require is
not defined`: Ajv's standalone output calls `require` for the ajv-formats runtime even
under `code: {esm: true}`. Fixable, but the fix keeps ajv-formats in the bundle anyway, and
by then the trade was 48 kB gzipped plus the parse of 518 kB against a saving that the next
measurement said was not there.

**The cheap part of §5.2 buys nothing either.** `validateSchema: false` was the one-line
version of "stop re-deciding a build-time fact in every browser", and in a Node microbenchmark
it looked excellent — `addSchema` 65 ms → 4.4 ms. In the browser, A/B on one build, three
runs each way at 4×:

| | `createSeamValidator` | validating the configs | **`buildBackend` total** |
|---|---:|---:|---:|
| `validateSchema: false` | ~55 ms | ~633 ms | **~1484 ms** |
| default (on) | ~273 ms | ~578 ms | **~1452 ms** |

The constructor really does get four times cheaper. The saving then reappears in
compilation, and the totals are indistinguishable — the `false` arm is 32 ms *slower* on
average, well inside a ±70 ms spread. So the flag was reverted rather than kept for the
look of the phase table it improves.

The first pass of this work claimed that change saved about 250 ms, on the strength of
comparing two different builds. It did not; that comparison was confounded by every other
change in the newer build, and the A/B above is what replaced it.

### The fault the reasoning missed twice

Reverting `validateSchema: false` put ~220 ms back onto first contentful paint, which made
no sense until the phase table was read again: **`createSeamValidator()` ran at module
scope**, so its ~270 ms at 4× sat in *front* of the starting frame rather than behind it.
Two commits had by then moved work behind that frame and neither noticed that the largest
single item before it was still there. It is now memoised and built on first use — nothing
wants it before the paint — and that is worth more than everything §5.2 proposed.

The general lesson is the one this repository already writes down: the measurement found
it, and reading the code twice had not.

### What survived from §5.2

`scripts/gates/check-schema-masters.ts`. The masters are now checked against the
meta-schema **and compiled** in CI, where a bad one fails the build instead of reaching a
reader. It is an addition rather than a replacement — the runtime check stays, since it was
measured to cost nothing net — and it is stricter than the browser ever was, because the
browser only ever validated the documents and never compiled them. Watched failing on a
master whose `type` breaks the meta-schema, on a dangling `$ref` that is meta-valid but
will not compile, and on a master with no `$id`. The middle one is the case the browser
could not have caught.

### What is still on the table

`buildBackend`'s remaining ~1.45 s at 4× is roughly 600 ms of Ajv compilation and 830 ms of
provisioning, and neither has been touched. The provisioning half is §5.4's territory:
native `crypto.subtle` for the ~340 ms of hand-written SHA-256, and the `archive.months`
question, which is the owner's rather than a performance decision. The Ajv half now has a
measured answer for what does *not* work, which is most of what §5.2 was worth.
