# Three capture mechanisms, one browser

You have probably arrived here because you noticed that `glance/`, `pair/` and `curate/`
do similar-looking things and wondered why they are not one command with a `--mode` flag.
That is a reasonable thing to wonder and this file is the answer. Read it before making
the change: the separation is the requirement (SRD PR-10), not an accident of how it was
built, and `client/e2e/tests/separation.test.ts` will stop you anyway.

## The three, side by side

|                | glance                        | pair                                    | curated                                  |
| -------------- | ----------------------------- | --------------------------------------- | ---------------------------------------- |
| Question       | what does it look like now?   | what did this change do?                | what should the blog show?               |
| Trigger        | an agent, mid-session         | CI, on a pull request                   | a person, after the feature works        |
| Consumer       | the author, once              | whoever reviews the change              | anyone who reads the site                |
| Clock          | **never pinned**              | **pinned to zero, restored afterwards** | pinned at the curator's discretion       |
| Entry point    | `glance/run.mjs`              | `pair/run.mjs`                          | `curate/run.mjs`                         |
| Playwright     | `client/e2e/glance.config.ts` | `client/e2e/pair.config.ts`             | `client/e2e/curate.config.ts`            |
| Output area    | `areas.glance`, git-ignored   | `areas.pair`, git-ignored               | `areas.curated_review`, git-ignored      |
| Lifetime       | the session                   | the branch (and a CI artefact)          | for ever                                 |
| Gate           | none                          | comparability                           | a person's review, then the site's gates |
| Committed      | never                         | never                                   | the only one that is                     |
| Retries        | none                          | none                                    | none                                     |

The three do not share an entry point, an output area, a naming convention, a retention
rule or a review gate (FR-001). They share exactly one thing: `client/e2e/shared/`, which
holds selectors, page objects, the readiness signal and the configuration loader — because
knowing how to find the component panel is a fact about the client, not a capture policy
(FR-002). Nothing in `shared/` names a glance, a pair or a curated shot, and a test says so.

## Why they do not share plumbing

1. **Only one of them is a comparison.** The pair needs the clock pinned to rate zero
   (SRD FR-53) because a difference between two moments of a moving system differs
   everywhere and says nothing. The glance must *not* pin, because it exists to show the
   system as it is, including the runaway loop the author is trying to see; pinning would
   alter the very thing being looked at. A single mechanism cannot both pin and not pin.
2. **The lifetimes are incompatible.** A durable artefact must be committed and reviewed;
   a session glance must be disposable and unreviewed. One mechanism serving both would
   either commit throwaway images — which bloats the repository and puts every one of them
   in the PR-01 review queue — or make blog images non-durable, which they cannot be.
3. **The failure modes have different costs.** A failed glance costs one round trip. A
   silently miscomparable pair produces something that *looks like evidence and is not*. A
   failed curated shot puts a misleading or leaky image on a public site. A shared
   mechanism has to adopt the strictest gate everywhere, which would make the glance slow
   and gated — and a gated glance is not a glance.
4. **Only one has a review gate.** PR-01 review belongs to the curated mechanism alone. If
   the glance shared the curated path, unreviewed images could reach the public site; if
   curated shots shared the glance path, the gate would have to be optional, and an
   optional gate on a public artefact is not a gate.
5. **Their triggers and owners differ.** Agent-in-session, CI-on-change,
   human-on-completion. Coupling them means a CI change can break the interactive loop,
   and the interactive loop is the feedback surface the delivery ordering depends on.

**FR-53 binds the pair alone.** It is written as a rule about capture, and its stated
rationale is comparison: pinning exists so that a before-and-after pair differs only where
the change under evidence differs. The glance deliberately does not pin. The curated
capture may pin, and does at both destinations today, but it decides that for itself on
different grounds — a shot that can be taken again a year later from the same seed at the
same simulated instant. That two of the three reach the same conclusion for different
reasons is precisely why they are not one mechanism with a flag: a flag would make the
reasons invisible, and the next person to change one would change all three.

What they may share is the browser installation and the library of application knowledge.

## Running them

Every entry point reads one configuration document, named by `HARNESS_CONFIG`, and nothing
below is written in any script (Constitution IV, FR-020). There is no default: a capture
taken against whichever destination happened to be the fallback is a capture nobody can
place afterwards.

```bash
export HARNESS_CONFIG=config/local/capture.json

# The page is served through the proxy, behind its clearance (issue #34 link 6), so every
# mechanism needs the credential to load it at all. The capture document names the
# identity and the variable carrying the secret; the deployment writes the secret into
# deploy/.env. A mechanism started without it refuses immediately, naming the variable.
set -a; . deploy/.env; set +a

# glance — an image of the client as it stands, now. Touches nothing.
node scripts/capture/glance/run.mjs

# pair — two halves and a difference. The change happens between the first two commands.
node scripts/capture/pair/run.mjs before my-change
#   ... make the change ...
node scripts/capture/pair/run.mjs after  my-change
node scripts/capture/pair/run.mjs diff   my-change

# curated — a candidate for the blog, and its provenance record. Commits nothing.
node scripts/capture/curate/run.mjs 016-three-mechanisms-one-browser "alt text"
```

They are also `pnpm capture:glance`, `pnpm capture:pair` and `pnpm capture:curate` from
`client/`; three scripts, none of them a flag on another.

None of the three starts the client. A capture observes a running system: bring one up
with `scripts/up.sh` first. A capture against nothing fails within a few seconds and names
the address it tried, which came from the configuration document.

## The hand-off for a curated shot

The curated mechanism writes a candidate and its provenance record into the review area
and stops. It commits nothing, and no workflow commits for it.

1. Run it. Look at the image. It is a picture that will be on a public site for ever.
2. If it is worth publishing, move **both** files — the `.png` and its
   `.provenance.json` — into the published-screenshot location feature 015 defines,
   `site/docs/blog/assets/`, keeping the `<feature-number>-<slug>` name.
3. Commit them there and reference the image from the blog entry.

That move is the review gate. It is deliberately a person's act: an automatic move would
turn a judgement into a default, which is the one thing PR-01 cannot survive.

The provenance record travels with the image because a picture on a blog outlives the
machine that took it. It gives the seed, the simulation time, the viewport, the device
scale factor, the browser version and the capture entry point's version — enough to take
the shot again — and it is checked to contain no filesystem path, no hostname and no user
name before it is written.

## The pinned browser

`browser.playwright_version` and `browser.container_image` in the capture configuration are
pins, and both are recorded in every pair fingerprint. An unpinned browser makes pairs
captured on different machines incomparable for reasons that look exactly like the change
under evidence: a font rasterises a shade differently, an antialiasing rule changes, and
the difference image lights up in places nobody touched. With the pin recorded, a drifted
browser is a named refusal — `browser.version: 141.0.7390.37 before, 142.0.7444.12 after` —
rather than a mystery.

The browser build is the one Playwright ships for the pinned release. It is installed with
`pnpm exec playwright install --with-deps chromium`, or, where an image already carries it,
found through `PLAYWRIGHT_BROWSERS_PATH`.

## What the pair refuses, and what it merely records

The fingerprint has two lists, and the difference between them is FR-007.

**Comparability fields**, which refuse: browser name and version, the Playwright pin, the
container image, viewport width and height, device scale factor, scenario seed, run
identifier, capture environment, and the pair entry point's version. If any of these
differs between the two halves, no difference image is produced at all and the field is
named. A difference that looks like evidence and is not is worse than no difference.

**Recorded observations**, which do not refuse: the simulation time and which components
were lit. Simulation time is here because FR-007 makes the pair restore the previous rate
after *each* capture, so the simulation runs between the two halves and simulated time
necessarily differs across them; refusing on it would refuse every pair the mechanism can
produce. It is recorded on both sides and reported in the summary. What is lit is here
because it is the change under evidence as often as not — the canonical first pair is the
simulation clock going from grey to lit, and a mechanism that refused on that could never
evidence the one transition it was built for.

## The liveness assertion, and what it has found so far

Before it captures, the pair reads which components are lit, pins the clock, and checks
that every one of them is still lit. If any fell dark, the capture fails and the message
names ADR-0006.

This is a regression test on a decision, not a hedge against an open question. The question
was open when this feature was specified: heartbeat cadence measured in *simulation* time
would mean that at rate zero no heartbeat is ever due, every liveness window expires, and
every component including the clock greys out during the very capture meant to evidence
illumination. ADR-0006 resolves it — cadence and liveness windows are real time, and the
simulation time a heartbeat carries is payload rather than schedule — and features 001 and
003 implement it. So a rate of zero stops simulated time and stops nothing else.

**In practice, so far.** The assertion has not fired. In this environment there is no
container runtime, so no broker and no clock service have been running during a capture,
and every capture taken to date has been of a shell with nothing lit — which is a real
state of a real system, and the one the earliest blog entries show, but it is a state in
which the assertion has nothing to compare. It becomes load-bearing the first time a pair
is captured against a running stack, which is what `.github/workflows/capture.yml` is for.
Until then the honest statement is: the check is written, it is exercised by the pair
spec's own code path, and it has never had a lit component to lose. Its failure would mean
a component has reverted to a simulation-time cadence.

## Two controls, and why they are in the repository

A capture-comparison test that has never failed is indistinguishable from one that compares
nothing, because `expect(a).toEqual(a)` passes too. Two deliberate controls are committed so
that never happens quietly.

- **`client/e2e/specs/determinism.spec.ts`** captures the same view twice, three times over,
  and asserts each difference is empty; then it puts a host-derived elapsed display on the
  page — a counter that ticks every animation frame, exactly what feature 012 removed from
  the shell for exactly this reason — and asserts the comparison catches it and draws a
  bounding box around it; then it removes the perturbation and asserts the empty property
  holds again. The perturbation lives in that file, is applied to a browser after the page
  has loaded, and is in no build of the client.
- **`client/e2e/tests/fixtures/merged-tree/`** is a miniature capture tree in which the
  glance imports the pair's clock pinning. The separation test runs over it and asserts it
  is rejected, naming the import.

Neither control is a mock. Nothing is lit that was not lit and no traffic is introduced;
what is perturbed is the input to a comparison, so that the comparison can be shown to
discriminate (Constitution VII, FR-018).

## What is not here

No fixture mode. No demo mode. No "populate for the screenshot" path, in any mechanism, at
any time. A screenshot showing a lit component is evidence that the component was alive,
and it has to stay that way to be worth capturing at all.
