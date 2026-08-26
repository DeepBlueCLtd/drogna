# Feature Specification: Security Proxy and Exposure Boundary

**Feature Branch**: `013-security-proxy`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD C-10 (reverse proxy: TLS, authentication, path policy; owns the failure mode of accidental exposure) and FR-39 to FR-42.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nothing is reachable that was not deliberately released (Priority: P1)

The author points a browser, or a colleague points a client, at the harness on the
droplet. Exactly one path prefix answers: the one carrying the collections that have
been deliberately released. Every other path the query layer is capable of serving —
the SensorThings collections over point observations, the planner's route collection,
the query layer's own administrative and catalogue endpoints — is refused at the
proxy without the request ever reaching upstream. Later, a new collection appears in
the query layer because a model run created it (SRD FR-21 makes that automatic). The
public surface does not change, because releasing is an act, not a side effect.

**Why this priority**: C-10 owns the failure mode of accidental exposure, and the
only structural defence against it is refusing by default. Every other part of this
feature assumes the deny is already in place. It is also the part that is cheapest to
get right at the start and most expensive to retrofit once paths have been published.

**Independent Test**: Stand the proxy up in front of a query layer holding a mixture
of released and unreleased collections. Enumerate every path the query layer advertises
in its own emitted specification, request each through the proxy, and assert that only
the released prefix answers. Delivers the exposure boundary on its own, with no
authentication and no leakage tests present.

**Acceptance Scenarios**:

1. **Given** a query layer serving collections `A` (released) and `B` (not released),
   **When** a cleared caller requests the released prefix path for `A`,
   **Then** the proxy returns the upstream response unmodified.
2. **Given** the same deployment,
   **When** a cleared caller requests the released prefix path for `B`,
   **Then** the proxy returns 404 and no request is recorded in the upstream access log.
3. **Given** the same deployment,
   **When** a caller requests the query layer's native path for `A`, bypassing the
   released prefix, **Then** the proxy returns the deny response.
4. **Given** a running deployment, **When** a new coverage collection becomes servable
   by the query layer without configuration change (SRD FR-21), **Then** the matrix of
   responses on the public surface is byte-identical to the matrix recorded before the
   run, until the collection is added to the released list and the proxy configuration
   is re-rendered.
5. **Given** a released collection `temperature` and an unreleased collection
   `temperature-raw`, **When** the unreleased path is requested,
   **Then** it is refused: prefix matching does not admit it.

---

### User Story 2 - Access is binary, and recorded as such (Priority: P2)

A caller either holds the single clearance the deployment issues, in which case every
released collection answers in full, or holds nothing, in which case the origin says
nothing at all. No response is partially populated, no field is blanked, no attribute
is dropped on the way through. The decision to build it this way is written down as an
ADR, because a later requirement for tiered access would not be a configuration change
but a different architecture.

**Why this priority**: Binary access is what makes path-prefix policy sufficient
(SRD FR-40). If clearance were tiered, the proxy could no longer decide from the path
alone and would have to inspect and edit response bodies. Recording the assumption is
part of the deliverable, not documentation of it.

**Independent Test**: Drive the proxy with a credential and without one, over both
released and unreleased paths, and compare response bodies byte-for-byte with the
upstream response. Assert the ADR exists and carries the four required headings.

**Acceptance Scenarios**:

1. **Given** a cleared caller, **When** any released path is requested,
   **Then** the response body is byte-identical to the upstream response body for the
   same request.
2. **Given** an uncleared caller, **When** a released path is requested,
   **Then** the response is a challenge carrying no data.
3. **Given** an uncleared caller, **When** a path that does not exist upstream is
   requested, **Then** the response is indistinguishable in status, body and headers
   from the response to a released path, so the released set cannot be enumerated
   without clearance.
4. **Given** the repository, **When** `docs/adr/0001-binary-access.md` is read,
   **Then** it carries Status, Context, Decision and Consequences, names tiered
   access as the rejected alternative, and states what would have to change if the
   assumption softened.

---

### User Story 3 - Exported files carry no provenance that identifies the sampling (Priority: P3)

A derived product leaves the harness for a downstream consumer. The consumer opens the
file. It contains the field and the metadata a reader needs to interpret it, and
nothing that says where the measurements behind it were taken, which sensor took them,
what the input files were called, or which host produced them. This is checked by a
scanner that runs over the bundle, not by reading the attributes by eye.

**Why this priority**: SRD FR-42 names this as one of two leakage paths that require
explicit tests. It is mechanical to check and therefore cheap to keep correct once the
scanner exists; the cost of not having the scanner is that the check silently stops
happening.

**Independent Test**: Run the scanner over a clean bundle produced by the offload
packager and over a deliberately-leaky fixture, and assert the first passes and the
second is flagged. No live system required.

**Acceptance Scenarios**:

1. **Given** a released bundle, **When** the provenance scanner walks every global
   attribute, variable attribute, variable name and dimension name in it,
   **Then** it reports zero hits against the identifying-material rules.
2. **Given** a fixture bundle whose `history` attribute contains the command line and
   input file paths that produced it, **When** the scanner runs,
   **Then** it flags the file, names the attribute, and exits non-zero.
3. **Given** a fixture bundle carrying a coordinate pair within the identification
   radius of a measurement location recorded in the run manifest, **When** the scanner
   runs, **Then** it flags the file.
4. **Given** a bundle with a global attribute the allow-list does not name,
   **When** the scanner runs, **Then** it flags the attribute, whatever its value:
   the rule is an allow-list, not a search for known-bad strings.

---

### User Story 4 - The shape of the released update does not redraw the sampling path (Priority: P4)

Two successive released products are compared by a downstream consumer, or by anyone
who keeps yesterday's file. The cells that changed between them form a picture. If
only the region near recent measurements was refreshed, that picture is the sampling
path, and the withholding in User Story 3 has been undone by arithmetic. A test
computes that picture and measures how well it recovers the measurement locations
recorded in the run manifest, and fails if the recovery is better than chance.

**Why this priority**: This is the subtler of the two leakage paths in SRD FR-42, and
it cannot be seen by inspection: the file contains no forbidden attribute and no
coordinate, yet the information is present. It sits last because it needs two
successive released products and therefore the offload path (feature 014) and a run
that actually moves.

**Independent Test**: Take a recorded pair of successive released products from a
scenario whose sampling path is known from the manifest, compute the change mask and
the recovery statistic, and assert it is at chance. Assert the same statistic on the
unmitigated control bundle is far above chance, which is what shows the test has the
power to fail.

**Acceptance Scenarios**:

1. **Given** two successive released products for the same collection on the same
   grid, **When** the change mask is computed as the set of cells whose released value
   differs by more than the released quantisation step, **Then** the recovery
   statistic of the mask against the buffered measurement locations from the run
   manifest is at or below the chance bound.
2. **Given** an unmitigated control pair, generated by disabling the whole-domain
   rewrite so that only cells near recent measurements are refreshed, **When** the same
   statistic is computed, **Then** it is at or above the detection bound, and the test
   asserts that it is: a build in which the control is not detected fails.
3. **Given** a released product set that includes a variable whose value is driven by
   observation age, **When** the test runs, **Then** the statistic exceeds the chance
   bound and the test fails, because an age-driven field is a map of measurement
   locations.
4. **Given** a scenario in which the platform did not move during the interval,
   **When** the test runs, **Then** it reports the statistic as inapplicable and fails
   the run as inconclusive rather than passing, so an immobile scenario cannot be used
   to obtain a green result.
5. **Given** two successive products that are identical, **When** the mask is empty,
   **Then** the test reports the comparison as inconclusive rather than passing.

---

### Edge Cases

- A request path that normalises into the released prefix only after decoding:
  `%2e%2e` traversal, duplicate slashes, a trailing dot, mixed case. Policy is applied
  to the normalised path, and anything that fails to normalise is denied.
- The query layer's own emitted OpenAPI and conformance documents enumerate every
  collection it serves, including withheld ones. Serving them through the released
  prefix would disclose the existence and shape of withheld collections even though
  their data stays refused.
- An upstream error page that echoes the upstream path, hostname or configuration file
  location back to the caller.
- `HEAD`, `OPTIONS` and CORS preflight against an unreleased path: the deny must not be
  method-dependent.
- Range and conditional requests against a released coverage file: refusing them is
  acceptable, answering them inconsistently with the full response is not.
- A released collection identifier that is a string prefix of an unreleased one.
- A collection removed from the released list while a client holds a cached URL.
- The provenance scanner meeting a file format it does not understand: an unrecognised
  member of a bundle is a failure, not a skip.
- A run manifest that is itself included in a bundle: it contains seeds, measurement
  geometry and the config digest, and is exactly the thing being withheld.
- Two successive released products on different grids or with different variable sets,
  where the change mask is not defined.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The proxy MUST deny by default. A request whose normalised path does not
  match an explicitly released location MUST be refused at the proxy without any
  request being made upstream. (SRD FR-41)
- **FR-002**: Released collections MUST be reachable only beneath a single released
  path prefix, whose value comes from the proxy's configuration file. The query layer's
  native paths MUST NOT be reachable through the proxy. (SRD FR-40, FR-41)
- **FR-003**: The released set MUST be an explicit list of collection identifiers in
  the proxy configuration. A collection present in the query layer but absent from that
  list MUST be refused, including collections that became servable without
  configuration change under SRD FR-21. (SRD FR-41)
- **FR-004**: Path policy MUST be evaluated on the normalised request path, and a path
  that cannot be normalised unambiguously MUST be refused. (SRD FR-40)
- **FR-005**: Access MUST be binary. A caller is cleared for all released data or for
  none. The proxy MUST NOT filter, blank, or otherwise alter a response body, and MUST
  NOT implement per-field redaction. (SRD FR-39)
- **FR-006**: For an uncleared caller, the response MUST be identical in status, body
  and headers for every path, whether or not that path exists or is released, so that
  the released set cannot be enumerated without clearance. For a cleared caller, an
  unreleased path MUST return not-found. (SRD FR-40, FR-41)
- **FR-007**: The proxy MUST terminate TLS, taking certificate and key locations,
  listening address, upstream address and released prefix from its configuration file.
  (SRD C-10)
- **FR-008**: No proxy source or template file MUST contain a literal hostname, port,
  filesystem path, URL or credential. The served configuration MUST be rendered from a
  template and a schema-validated configuration file before the proxy starts.
  (Constitution IV; SRD NFR-04, NFR-05)
- **FR-009**: The binary-access assumption MUST be recorded at
  `docs/adr/0001-binary-access.md`, carrying Status, Context, Decision and
  Consequences, naming tiered access as the rejected alternative and stating what
  changes materially if the assumption softens. (SRD FR-39, PR-03)
- **FR-010**: Point observations, measurement locations and planned routes MUST NOT be
  reachable through the released prefix. The SensorThings collections over the
  observation store and the planner's route output MUST NOT appear in the released
  list, and a test MUST assert their absence rather than relying on the list being
  written correctly. (SRD FR-42)
- **FR-011**: Every released artefact MUST be scanned for provenance metadata before
  release. The scanner MUST walk global attributes, variable attributes, variable
  names, dimension names and any embedded text member of a bundle. (SRD FR-42)
- **FR-012**: The provenance scanner MUST operate as an allow-list of permitted
  attribute keys with permitted value patterns, so that an attribute nobody anticipated
  is flagged rather than ignored. It MUST additionally flag any value containing a
  filesystem path, a hostname, a user name, a sensor, thing or datastream identifier, a
  route waypoint, or a coordinate pair falling within the identification radius of a
  measurement location recorded in the run manifest. (SRD FR-42)
- **FR-013**: The provenance scanner MUST be exercised against a deliberately-leaky
  fixture on every run, and the test MUST fail if the fixture is not flagged. A scanner
  that cannot detect a known leak is not evidence of anything. (SRD FR-42)
- **FR-014**: A released product set MUST be constrained by a configured allow-list of
  variables. Any variable not on that list MUST be absent from released artefacts.
  (SRD FR-42)
- **FR-015**: The updated-region leakage test MUST compute, from two successive
  released products for the same collection on the same grid, the change mask of cells
  whose released value differs by more than the released quantisation step, and MUST
  report a recovery statistic of that mask against the measurement locations recorded
  in the run manifest, buffered by the configured identification radius. (SRD FR-42)
- **FR-016**: The updated-region leakage test MUST assert both bounds: the mitigated
  bundle at or below the chance bound, and an unmitigated control at or above the
  detection bound. A run in which the control is not detected MUST fail. (SRD FR-42)
- **FR-017**: The updated-region leakage test MUST report a comparison as inconclusive,
  and fail, when the change mask is empty, when the measurement locations in the
  interval do not span more than the identification radius, or when the two products
  differ in grid or variable set. It MUST NOT report a pass in any of those cases.
  (SRD FR-42)
- **FR-018**: The leakage tests MUST run against a recorded bundle without a live
  system, from seeded fixtures, so a failure is reproducible from the repository alone.
  (Constitution II; SRD AT-04)
- **FR-019**: The leakage tests MUST run as a distinct gate that can be pointed at any
  candidate release bundle, and MUST fail the build on any hit. (SRD FR-42;
  Constitution X)
- **FR-020**: The proxy MUST record every refusal with the normalised path and the rule
  that refused it, so that an unexpected refusal is diagnosable without loosening
  policy to find out what happened. (SRD C-10)
- **FR-021**: Every HTTP surface the proxy fronts MUST be subject to the same
  default-deny, including any protocol-upgrade path. Until the client's transport for
  control-namespace messages is settled, the rendered configuration MUST emit no
  protocol-upgrade location at all, which is the safe reading of default-deny. If such a
  location is later added, it MUST be confined to the control namespace and MUST NOT
  carry `obs/#`, which is where measurement locations travel. (SRD FR-41, FR-46, FR-52;
  Constitution X)

### Key Entities

- **Release policy**: the configured list of released collection identifiers, the
  released path prefix, the released variable allow-list, and the identification
  radius. The single place where exposure is opted into.
- **Released location**: one entry in the served proxy configuration, generated from
  one released collection identifier. Nothing is served that is not one of these.
- **Clearance**: the single credential set a deployment issues. Holding it means
  cleared for all released data; not holding it means cleared for none. There is no
  third state and no per-caller scope.
- **Released artefact**: a file or response body that leaves the boundary. Subject to
  the variable allow-list, the provenance scan and the updated-region test.
- **Change mask**: the set of grid cells whose released value differs between two
  successive released products by more than the released quantisation step.
- **Measurement geometry**: the positions and simulation times of measurements in a
  run, read from the run manifest by the tests only, never by anything that serves.
- **Leakage report**: the output of a scan or test — bundle identity, rule, location
  within the file, statistic and bound. Written whether or not anything was found, so
  a silent pass and a scan that did not run are distinguishable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a request matrix built by enumerating every path the query layer
  advertises in its own emitted specification, 100% of unreleased paths are refused and
  0% reach upstream, verified from the upstream access log.
- **SC-002**: Adding a collection to the query layer and restarting it, with no change
  to the proxy configuration, leaves the public response matrix byte-identical.
- **SC-003**: An uncleared caller receives the same status, body and headers for a
  released path, an unreleased path and a nonexistent path — three responses, zero
  differences.
- **SC-004**: The provenance scanner reports zero hits on a clean bundle and flags the
  leaky control fixture on every CI run; both results are reproducible from a seed.
- **SC-005**: The recovery statistic for the mitigated bundle is at or below the chance
  bound and the unmitigated control is at or above the detection bound, with both
  figures printed in the leakage report rather than asserted silently.
- **SC-006**: No file under the proxy directory contains a literal hostname, port, path
  or credential, verified by the repository's literal-path gate.
- **SC-007**: `docs/adr/0001-binary-access.md` exists, carries the four required
  headings, and is referenced from the constitution's Principle X.
- **SC-008**: The full leakage gate runs from a clean checkout in one command and
  completes without a running deployment.

## Assumptions

- Authentication is HTTP Basic over TLS against a single credential set rendered from
  configuration at deploy time. Binary clearance needs no user model, and anything
  richer would be the tiered access ADR-0001 rules out. Recorded here because the SRD
  fixes the shape of access (FR-39) but not its mechanism.
- The deny response for an uncleared caller is a uniform challenge; for a cleared
  caller requesting an unreleased path it is not-found. This satisfies FR-006 while
  leaving a challenge flow that a browser can complete.
- The released path prefix defaults to a single segment supplied by configuration. No
  value is fixed in source (Constitution IV).
- The mitigation for the updated-region leakage path is that released products are
  whole-domain rewrites on every publication cycle, and that variables driven by
  observation age are excluded from the released variable allow-list. The SRD requires
  the test, not a particular mitigation; this is the mitigation the test is written
  against, and the test is what holds it in place.
- The identification radius, the released quantisation step, the chance bound and the
  detection bound are configuration values with defaults recorded in the test
  configuration, not constants in test source.
- The leakage tests consume bundles produced by feature 014 and the run manifest
  produced by feature 004. Where those are not yet available, they run against recorded
  fixtures committed with the tests.
- TLS material is provisioned by the deployment feature (SRD NFR-06); this feature
  consumes its location from configuration and does not manage certificates.
- The proxy fronts HTTP surfaces only, and the broker is not proxied. The SRD does not
  say how the browser client receives the control-namespace messages that drive
  illumination (FR-46, FR-52) — whether over a broker connection upgraded through this
  proxy or by reaching the broker directly. The two produce materially different path
  policies, so this feature takes the closed reading and emits no upgrade location. The
  question belongs in the SRD's §11 table if the client is to reach the broker through
  this proxy.
- `contracts/schemas/config.proxy.schema.json` is added additively by this feature, per
  the ownership rule in `docs/architecture/repo-layout.md`.
- nginx access and error logs are written with the host clock. This is log line
  decoration, which Constitution I permits; no operational decision in this feature
  reads a host clock.
