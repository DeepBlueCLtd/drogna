# Implementation Plan: Security Proxy and Exposure Boundary

**Branch**: `013-security-proxy` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-security-proxy/spec.md`

## Summary

Put a default-deny reverse proxy in front of the query layer so that the only
reachable surface is a configured list of released collections beneath one path
prefix, with binary clearance and no response rewriting; record the binary-access
assumption as ADR-0001; and build two leakage gates over released artefacts — an
allow-list scan of provenance metadata, and a statistical test that the shape of the
change between successive released products does not recover the measurement geometry.

The proxy's served configuration is rendered from a template and a schema-validated
configuration file, one location per released collection, with a default location that
refuses. The leakage tests are a pytest suite that runs over a recorded bundle with no
live system, and each carries a deliberately-leaky control so a test that has lost its
power fails rather than passing quietly.

## Technical Context

**Language/Version**: nginx configuration (rendered, not hand-maintained) served by
nginx 1.25 in the Compose deployment; Python 3.11 for the configuration renderer and
for the leakage suite, under the `uv` workspace.

**Primary Dependencies**: nginx; Jinja2 for template rendering; `harness_core` for the
configuration loader and schema validation; `netCDF4`/`xarray` for reading released
coverage artefacts; `numpy` for the change mask and recovery statistic; `pytest`;
`httpx` for the request-matrix tests.

**Storage**: None owned. The proxy holds no state. The leakage suite reads released
bundles from the offload staging area and run manifests, both located from
configuration.

**Testing**: `pytest`. Three suites: the rendered-configuration unit tests and the
request matrix (integration, needs nginx and a stub upstream in a container), and
`tests/leakage/` which needs neither and runs from committed fixtures. `nginx -t`
validates every rendered configuration before it is served.

**Target Platform**: Linux under Docker Compose, one configuration and two
destinations (local and droplet), per SRD NFR-05 and NFR-06.

**Project Type**: Infrastructure configuration plus a test suite. No service, no
long-lived Python process, no heartbeat.

**Performance Goals**: None beyond not being the bottleneck for a single-viewer
demonstration. The request matrix over the full advertised path set completes in under
60 seconds; the leakage gate completes in under 120 seconds on committed fixtures.

**Constraints**: Default-deny; no literal hosts, ports, paths or credentials in source
or template; no response body rewriting anywhere in the path; leakage tests
deterministic from a seed and runnable without a deployment.

**Scale/Scope**: One origin, one credential set, a released list of a handful of
collections, one concurrent viewer. Deliberately small; the interesting property is the
shape of the policy, not its throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — No operational decision in this feature reads a clock.
  nginx writes host time into access and error logs, which is log line decoration and
  explicitly permitted. The leakage tests take all times from the run manifest and the
  artefacts under test, never from the host. Compliant.
- **II. Seeded Randomness and Deterministic Replay** — The leakage fixtures are
  generated from a recorded seed and committed; both the control and the clean bundle
  are reproducible. The recovery statistic is deterministic given the same inputs, and
  the report prints the figures so a drift is visible rather than inferred. Compliant.
- **III. Generated Types Only** — This feature adds
  `contracts/schemas/config.proxy.schema.json` as an additive contribution and consumes
  the generated Python config types from `libs/harness_types/`. No configuration shape
  is hand-written twice. The nginx configuration is generated from that validated
  configuration, not maintained beside it. Compliant.
- **IV. No Literal Paths or Hosts** — The renderer reads exactly one environment
  variable, `HARNESS_CONFIG`, validates the file against its schema before any other
  I/O, and emits the served configuration. Listening address, upstream address,
  released prefix, certificate paths and credential file location all come from that
  file. Compliant, and enforced by the repository's literal-path gate over `proxy/`.
- **V. No Tracked Entities** — This feature exists to keep measurement geometry inside
  the boundary. The leakage suite reads measurement positions from the run manifest to
  test against them; nothing it reads is a track, and nothing it writes contains one.
  The word used throughout is *measurement geometry*, because the simulated platform is
  a sampling platform and a coordinate. Compliant.
- **VI. Honest Ports** — The proxy is plumbing and is documented as plumbing. No
  abstraction is placed over nginx, no "proxy port" interface is introduced, and
  swapping nginx is not claimed. Compliant.
- **X. Default Deny at the Boundary** — This feature is the principle. Binary access
  (no per-field redaction) is FR-005 and ADR-0001; the dedicated prefix with
  default-deny is FR-001 to FR-003; the two explicit leakage tests are FR-011 to FR-017.
  Compliant.
- **Quality gates** — Adds a seventh runnable gate, the leakage gate, alongside the six
  in the constitution. It is separable because it runs over a candidate bundle rather
  than over the source tree.

No violation requires justification. Complexity Tracking is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/013-security-proxy/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
proxy/                                  C-10, owned by this feature
├── templates/
│   └── harness.conf.j2                 the only place policy is expressed
├── render_config.py                    HARNESS_CONFIG in, served config out
├── policy.py                           released-list to location mapping, normalisation
├── entrypoint.sh                       render, nginx -t, exec nginx
└── tests/
    ├── test_render_config.py           unit: rendering, ordering, escaping
    ├── test_policy.py                  unit: prefix matching, normalisation
    └── test_request_matrix.py          integration: nginx + stub upstream

tests/leakage/                          owned by this feature
├── conftest.py                         fixture loading, report writing
├── rules/
│   ├── attribute_allowlist.yaml        permitted attribute keys and value patterns
│   └── identifying_patterns.yaml       paths, hosts, identifiers, coordinates
├── scanner.py                          the provenance scanner
├── updated_region.py                   change mask and recovery statistic
├── test_provenance.py                  clean bundle passes, leaky control is flagged
├── test_updated_region.py              mitigated at chance, control detected
└── fixtures/
    ├── clean_bundle/
    ├── leaky_bundle/                   deliberate control, documented as such
    ├── mitigated_pair/
    └── unmitigated_pair/               deliberate control, documented as such

docs/adr/
└── 0001-binary-access.md               owned by this feature

contracts/schemas/
└── config.proxy.schema.json            additive contribution
```

**Structure Decision**: This feature owns `proxy/`, `tests/leakage/` and
`docs/adr/0001-binary-access.md`, and nothing else. It adds one schema file to
`contracts/`, which the repository layout permits as an additive contribution by the
feature that first needs the shape.

`tests/leakage/` is a new sibling under the existing root `tests/`, alongside
`tests/integration/` and `tests/acceptance/`, not a new top-level directory. It is
separate from `tests/integration/` for three reasons: it runs over an artefact rather
than a running system, so it can be pointed at any candidate bundle including one
produced elsewhere; it carries deliberate leaky fixtures that must never be mistaken
for test data of the ordinary kind; and it is a release gate rather than a regression
test, so it needs to be runnable on its own at the moment of releasing something.

The proxy directory contains no hand-maintained nginx configuration. The template is
the only expression of policy, and the rendered file is a build artefact that is
validated with `nginx -t` before it is served. Locating the renderer inside `proxy/`
rather than in `scripts/` keeps the feature within its owned directories; `scripts/`
belongs to the repository-wide gates.
