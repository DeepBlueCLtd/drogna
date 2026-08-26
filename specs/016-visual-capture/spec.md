# Feature Specification: Visual Capture — Three Mechanisms, One Browser

**Feature Branch**: `016-visual-capture`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD PR-10 (Playwright captures screenshots at three distinct moments which do not share plumbing; only the third is a durable artefact), with FR-53 (capture pins the clock rate to zero for the duration of a capture) and FR-52 (no mocked or synthesised traffic ever drives illumination).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The agent shows the author what it just did (Priority: P1)

Mid-session, the agent has changed something visible and wants the author's eye on it
before going further. It captures the client as it stands, right now, in whatever state
the running system happens to be in, and the author looks at the image. The capture
touches nothing: it does not pin the clock, does not reset the scenario, does not
navigate anywhere that changes state. The image lives for the session and is never
committed, never reviewed and never referred to again.

**Why this priority**: This is the feedback surface the SRD's delivery ordering points
at when it calls the greyed-out shell "the anchor for the Playwright loop". It is used
many times a day, and its whole value is being immediate. It is also the only one of the
three that is useful before there is anything else to compare against.

**Independent Test**: With the client running, invoke the glance entry point and confirm
an image appears in the session area within seconds, that nothing is written anywhere
else, and that the running system's clock rate is unchanged before and after.

**Acceptance Scenarios**:

1. **Given** a running client, **When** the glance entry point is invoked, **Then** an
   image of the current view is written to the session area and its path is printed.
2. **Given** a running client at a non-zero clock rate, **When** a glance is taken,
   **Then** the clock rate is the same afterwards as before: the glance shows the system
   as it is, including its motion.
3. **Given** a client that is mid-render, **When** a glance is taken, **Then** it waits
   on the application's readiness signal rather than on a fixed delay, and reports
   plainly if readiness never arrives.
4. **Given** no client running, **When** a glance is invoked, **Then** it fails within a
   few seconds with a message naming the address it tried, which came from configuration
   rather than from a literal in the script.
5. **Given** any number of glances taken, **When** the working tree is inspected,
   **Then** none of them is tracked by git.

---

### User Story 2 - A change is evidenced by a pair that differs only where the change does (Priority: P2)

Within a feature, something visible changes. Two captures are taken of the same view,
one before and one after, and the difference between them is the evidence. For that
difference to mean anything, everything else must be still: the simulation clock is
pinned to rate zero for the duration of each capture, both halves are captured in the
same environment, and the mechanism refuses to produce a diff at all when the two sides
are not comparable. When nothing has changed, the diff is empty — and a mechanism whose
no-change diff is not empty has no business being trusted with a change.

**Why this priority**: This is the only mechanism of the three that is a comparison, and
comparison is the only thing that needs the clock pinned. A pair that differs everywhere
carries no information, so the requirement in FR-53 is what makes this story possible at
all. It sits below the glance because it is used per change rather than per thought.

**Independent Test**: Capture a pair across a change with a known visual delta and
confirm the diff isolates it. Then capture a pair across no change at all, three times,
and confirm every diff is empty.

**Acceptance Scenarios**:

1. **Given** a running scenario, **When** a pair capture begins, **Then** the clock rate
   is pinned to zero before the first pixel is captured and restored to its previous
   value afterwards, including when the capture fails part way through.
2. **Given** a pair captured across no change, **When** the two images are compared,
   **Then** the difference is empty, on three consecutive runs.
3. **Given** the simulation clock is the only live component and the change under
   evidence is its illumination, **When** a pair is captured across that change,
   **Then** the diff shows exactly the component that changed from grey to lit and
   nothing else.
4. **Given** a pair whose two halves were captured with different browser versions,
   different viewports, different scenario seeds, or one locally and one in CI,
   **When** a diff is requested, **Then** the mechanism refuses and names the field that
   differs, rather than producing a diff that looks like evidence.
5. **Given** the clock is pinned to zero, **When** the capture runs, **Then** every
   component that was lit before the pin is still lit in the captured image, and the
   capture fails if any fell dark: a pinned clock must not quietly produce an all-grey
   pair.
6. **Given** any pair, **When** the working tree is inspected, **Then** neither half nor
   the diff is tracked by git; the pair's life is the life of the branch.

---

### User Story 3 - A finished feature gets a picture worth publishing (Priority: P3)

A feature works. The author chooses the moment and the framing, runs the curated
capture, looks at what came out, and commits the images that will appear in the blog
entry. They are taken at one fixed viewport so the blog looks like one publication
rather than a scrapbook; they show no browser chrome, no address bar and no host path;
and each carries a small record of the scenario seed, the simulation time and the
viewport, so the shot can be taken again a year later.

**Why this priority**: This is the only durable artefact of the three and the only one
that reaches the public, but it is needed once per feature rather than continuously, and
only after the feature works. It cannot lead, and nothing else waits on it.

**Independent Test**: Run the curated capture against a working feature, confirm the
candidates appear in a review area with their provenance records, commit one, and
confirm it lands in the location the published site expects.

**Acceptance Scenarios**:

1. **Given** a working feature and a chosen scenario state, **When** the curated capture
   runs, **Then** it writes candidate images and their provenance records to a review
   area and commits nothing.
2. **Given** candidates in the review area, **When** the author commits one, **Then** it
   lands under the published-screenshot location and naming convention that feature 015
   defines, and the site build finds it.
3. **Given** any curated image, **When** its dimensions are checked against every other
   curated image in the repository, **Then** the viewport and device scale factor are
   the same.
4. **Given** any curated image, **When** it is inspected, **Then** it contains no browser
   chrome, no address bar, no window title and no filesystem path, and any in-page
   display of a deployment hostname is masked.
5. **Given** a curated image's provenance record, **When** it is read, **Then** it gives
   the scenario seed, the simulation time, the viewport, the device scale factor and the
   capture entry-point version, and contains no filesystem path, hostname or user name.
6. **Given** a curated capture, **When** the scenario is inspected, **Then** no mocked or
   synthesised traffic was introduced to make the picture more interesting; every lit
   component in the image was genuinely alive.

---

### User Story 4 - The three mechanisms stay three mechanisms (Priority: P4)

Someone notices that the three entry points do similar-looking things and proposes to
unify them behind one command with flags. The repository answers with a test: the entry
points do not import one another, they do not write into one another's areas, and only
one of the three has any committed output. The reason they are separate is written down
where the person contemplating the merge will read it.

**Why this priority**: The separation is the requirement, not an implementation detail
of it, and separations that are only intended do not survive. It is last because there
must be three mechanisms before there is anything to keep apart.

**Independent Test**: Run the separation test on a tree in which one entry point has been
made to import another, and confirm it fails.

**Acceptance Scenarios**:

1. **Given** the three entry points, **When** their imports are inspected, **Then** none
   imports another, and the only module all three share is the library of application
   knowledge — selectors, page objects and the readiness signal.
2. **Given** the three output areas, **When** each mechanism runs, **Then** it writes
   only into its own area, and a test asserts the areas are disjoint.
3. **Given** the repository, **When** tracked files are listed, **Then** only the curated
   area contains committed images.
4. **Given** a tree modified so that the glance entry point imports the pair's clock
   pinning, **When** the separation test runs, **Then** it fails and names the import.

---

### Edge Cases

- A glance requested while a pair capture holds the clock at zero: the glance would show
  a stopped system without saying so. The glance reports the clock rate it observed
  alongside the image rather than silently presenting a frozen view as a live one.
- A pair capture that crashes between pinning the clock and restoring it, leaving the
  whole harness stopped for the next person who looks at it.
- Two pair captures running at once, each restoring what it believes the previous rate
  to have been.
- The clock's heartbeat interval measured in simulation time: with the rate pinned to
  zero, simulation time does not advance, and every component including the clock could
  fall outside its liveness window and go grey during the very capture meant to evidence
  illumination.
- An all-grey shell in the earliest days: with no live component, every capture is
  identical and the pipeline is shown to run but never shown to discriminate.
- A curated capture taken on a machine with different fonts from the one that took the
  previous blog entry's shots, so the blog drifts in appearance without anything
  changing.
- A curated image that grows to several megabytes and is committed.
- A capture that shows a component lit which is not in fact alive, which cannot arise
  from a mock because no mock exists, but could arise from a stale liveness window.
- A readiness signal that never arrives because the change under test broke the client:
  the capture must report that clearly rather than timing out into an empty image.
- A pair whose two halves are captured at different browser window sizes because one
  machine has a different device scale factor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: There MUST be three capture mechanisms — glance, pair and curated — with
  three entry points, three configurations and three output areas. They MUST NOT share a
  capture entry point, an output area, a naming convention, a retention rule or a review
  gate. (SRD PR-10)
- **FR-002**: The three MUST share exactly one thing: the library of application
  knowledge — selectors, page objects and the readiness signal — because that is
  knowledge of the client rather than capture policy. No entry point MUST import
  another. (SRD PR-10)
- **FR-003**: The glance MUST capture the client as it stands, on demand, and MUST NOT
  alter the running system: it MUST NOT pin the clock, reset the scenario, or navigate
  anywhere that changes state. (SRD PR-10)
- **FR-004**: Glance output MUST be written to a session-scoped area that is ignored by
  git, and MUST have no retention rule beyond the session. (SRD PR-10)
- **FR-005**: The glance MUST report the clock rate it observed alongside the image, so a
  frozen system is never silently presented as a live one. (SRD FR-53 interaction)
- **FR-006**: The pair MUST capture the same view before and after a change and produce a
  difference between them. (SRD PR-10)
- **FR-007**: The pair MUST pin the clock rate to zero for the duration of each capture
  and MUST restore the previous rate afterwards, including on failure. (SRD FR-53)
- **FR-008**: The pair MUST verify that every component lit before the pin is still lit
  in the captured image, and MUST fail the capture otherwise, so a pinned clock cannot
  produce an all-grey pair that looks like a passing capture. (SRD FR-52, FR-45)
- **FR-009**: The pair MUST record an environment fingerprint on both sides — browser
  version, container image, viewport, device scale factor, scenario seed, simulation time
  and capture entry-point version — and MUST refuse to produce a diff when the two sides
  differ, naming the field. (SRD FR-53)
- **FR-010**: Both halves of a pair MUST be captured in the same environment. A pair with
  one half captured locally and one in CI MUST be refused. (SRD FR-53)
- **FR-011**: A pair captured across no change MUST produce an empty difference, on
  repeated runs. (SRD FR-53)
- **FR-012**: Pair output MUST NOT be committed. Its retention is the life of the branch:
  a declared retention period as a CI artefact, and a git-ignored branch-scoped area
  locally. (SRD PR-10)
- **FR-013**: The curated capture MUST be triggered deliberately by a person after the
  feature works, MUST write candidates and their provenance records to a review area, and
  MUST NOT commit anything itself. (SRD PR-08, PR-10)
- **FR-014**: Curated images MUST be committed under the published-screenshot location
  and naming convention defined by feature 015, and MUST be the only capture output
  tracked by git. (SRD PR-08, PR-10)
- **FR-015**: Curated images MUST use one fixed viewport and device scale factor across
  the whole blog. (SRD PR-07, PR-08)
- **FR-016**: Each curated image MUST carry a provenance record giving the scenario seed,
  the simulation time, the viewport, the device scale factor and the capture entry-point
  version, sufficient to take the shot again. The record MUST contain no filesystem path,
  hostname or user name. (SRD PR-01, PR-08)
- **FR-017**: Curated captures MUST capture the viewport only. No browser chrome, address
  bar or window title MUST appear, and any in-page display of a deployment hostname MUST
  be masked. (SRD PR-01)
- **FR-018**: No capture mechanism MUST introduce mocked or synthesised traffic, a
  fixture mode or a demo mode to make a screenshot more interesting. Every lit component
  in every image MUST have been genuinely alive. (SRD FR-52; Constitution VII)
- **FR-019**: Every wait in every mechanism MUST be on an application readiness signal.
  No fixed sleep MUST appear in any capture path. (SRD FR-53; Constitution I in spirit)
- **FR-020**: All three entry points MUST take the client address, the output locations,
  the viewport and the device scale factor from a capture configuration file rather than
  from literals. (Constitution IV)
- **FR-021**: `.github/workflows/capture.yml` MUST run the pair mechanism on pull
  requests and MUST NOT run the glance mechanism. The curated mechanism MUST be
  manually triggered and MUST produce a reviewable candidate without committing it.
  (SRD PR-10)
- **FR-022**: A test MUST assert the separation: no cross-import between entry points,
  disjoint output areas, and only curated output tracked by git. (SRD PR-10)
- **FR-023**: The reason the three do not share plumbing MUST be recorded beside the code,
  so that the person contemplating a unification reads the argument before making it.
  (SRD PR-10)

### Key Entities

- **Glance**: one image of the client as it stands, taken on demand during a session.
  Lifetime: the session. Storage: a git-ignored session area. Gate: none.
- **Pair**: two images of the same view either side of a change, plus their difference
  and their environment fingerprints. Lifetime: the branch. Storage: a CI artefact with
  a declared retention period, and a git-ignored branch-scoped area locally. Gate:
  comparability.
- **Curated image**: one published picture of a finished feature, with a provenance
  record. Lifetime: permanent. Storage: committed under the location feature 015 defines.
  Gate: the author's review and the site's publication gates.
- **Environment fingerprint**: what must match for two captures to be comparable.
- **Provenance record**: what must be known to take a curated shot again.
- **Application knowledge library**: selectors, page objects and the readiness signal.
  The only thing the three mechanisms share.
- **Clock pin**: a temporary rate of zero held by the pair mechanism, and restored by it.

### Why the three do not share plumbing

The instruction in PR-10 is a design constraint, not a description, and it is the one
thing in this feature worth arguing for explicitly.

1. **Only one of them is a comparison.** The pair needs the clock pinned to zero
   (FR-53) because a diff between two moments of a moving system differs everywhere and
   says nothing. The glance must not pin, because it exists to show the system as it is,
   including a runaway loop the author is trying to see; pinning would alter the very
   thing being looked at. A single mechanism cannot both pin and not pin.
2. **The lifetimes are incompatible.** A durable artefact must be committed and reviewed;
   a session glance must be disposable and unreviewed. One mechanism serving both would
   either commit throwaway images, which bloats the repository and puts every one of them
   into the PR-01 review queue, or make blog images non-durable, which they cannot be.
3. **The failure modes have different costs.** A failed glance costs one round trip. A
   silently miscomparable pair produces something that looks like evidence and is not. A
   failed curated shot puts a misleading or leaky image on a public site. A shared
   mechanism has to adopt the strictest gate everywhere, which would make the glance slow
   and gated — and a gated glance is not a glance.
4. **Only one has a review gate.** PR-01 review belongs to the curated mechanism alone.
   If the glance shared the curated path, unreviewed images could reach the public site;
   if the curated shots shared the glance path, the gate would have to be optional, and an
   optional gate on a public artefact is not a gate.
5. **Their triggers and owners differ.** Agent-in-session, CI-on-change, human-on-
   completion. Coupling them means a CI change can break the interactive loop, and the
   interactive loop is the feedback surface the delivery ordering depends on.

What they may share is the browser installation and the library of application knowledge,
because knowing how to find the component panel is a fact about the client and not a
capture policy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A glance completes from invocation to image on disk in under ten seconds
  against an already-running client.
- **SC-002**: The clock rate observed before and after a glance is identical in 100% of
  runs.
- **SC-003**: A pair captured across no change produces an empty difference on three
  consecutive runs.
- **SC-004**: A pair captured across the simulation clock's illumination transition
  produces a difference confined to that component.
- **SC-005**: Every incomparable-pair case — differing browser version, viewport, device
  scale, seed, or capture environment — is refused, and the refusal names the field.
- **SC-006**: The clock rate is restored after every pair capture, including every
  injected failure, verified by comparing the rate before and after.
- **SC-007**: No component that was lit before a clock pin is dark in the captured image.
- **SC-008**: Zero glance or pair outputs are tracked by git in any state.
- **SC-009**: Every curated image in the repository has the same dimensions and device
  scale factor, and each has a provenance record containing no path, hostname or user
  name.
- **SC-010**: The separation test fails on a tree in which one entry point imports
  another, demonstrated against a deliberately broken fixture tree.
- **SC-011**: No capture path contains a fixed sleep, verified by a lint rule over
  `client/e2e/` and `scripts/capture/`.

## Assumptions

- FR-53 is read as binding the pair mechanism, following its stated rationale: pinning
  exists so that a before/after pair differs only where the change under evidence
  differs. The glance deliberately does not pin, because pinning would change the state
  the author asked to see. The curated capture may pin at the curator's discretion to
  make a shot regenerable; that it decides this for itself, on different grounds, is part
  of why the three do not share plumbing.
- The clock rate is set through the same rate control the client exposes (SRD FR-10,
  FR-49), not through a private capture-only interface. The pair mechanism is therefore a
  client of C-01 like anything else.
- Pinning the clock stops the whole running system, not one viewer's view of it. The
  harness is a single-viewer demonstration (SRD NFR-06), so this is acceptable; the pair
  mechanism restores the previous rate and reports if it could not.
- Whether the clock's heartbeat continues while its rate is zero determines whether
  components stay lit during a capture. This feature does not decide that; it asserts it
  (FR-008), so that if heartbeats stop the capture fails loudly instead of publishing an
  all-grey image. If the assertion fails in practice, the resolution belongs to the clock
  and liveness features, not here.
- SRD §11's third question is answered: the greyed-out shell needs no mocked traffic
  (FR-52). The earliest exercise of the capture pipeline therefore has exactly one live
  component to work with — the simulation clock, which is first in the delivery order
  anyway — and its illumination transition is the first genuine before/after pair.
- The entry points are TypeScript run through the client's own Playwright installation
  and package manager, since the constitution fixes Playwright and `pnpm` for the client.
- The published-screenshot location and naming convention are owned by feature 015; this
  feature writes into them. Scanning the text inside published images is also feature
  015's publication gate; this feature's obligation is not to capture chrome in the first
  place.
- Browser version and container image are pinned so that pairs captured on different
  machines are comparable at all; the fingerprint check is what makes a drifted pin
  visible rather than a source of unexplained diffs.
- `contracts/schemas/config.capture.schema.json` is added additively by this feature, per
  the ownership rule in `docs/architecture/repo-layout.md`.
