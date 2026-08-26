# Implementation Plan: EDR Trajectory Spike

**Branch**: `002-edr-trajectory-spike` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-edr-trajectory-spike/spec.md`

## Summary

Prove the one thing SRD §10 still calls unproven: that the per-vertex M ordinate of an EDR
trajectory `coords` string survives WKT parsing and reaches a provider intact. Everything around
that proof is now settled — no supplied pygeoapi provider implements trajectory, so drogna builds a
bespoke EDR provider plugin behind the coverage output port (FR-50), and pygeoapi parses `coords`
with `shapely.wkt.loads` and hands the geometry on untouched, which is why the parsing behaviour is
the load-bearing question and why Shapely 2.1 on GEOS 3.12 must be pinned (FR-51).

The method is three steps of increasing commitment: a version probe that parses a `LINESTRINGZM` at
the pinned versions and below them, printing recovered M ordinates and NaNs side by side; a
throwaway provider plugin registered with a pygeoapi instance that records exactly what it is handed;
and one four-dimensional route sampled against a small synthetic coverage, scored against an
analytic expectation built so that per-vertex and single-time answers cannot be confused. The
deliverable is a dated finding that hands the query-layer feature the provider seam, the version pin
with its comment, and the adoptable parsing test, plus an ADR that outlives the spike directory.

## Technical Context

**Language/Version**: Python 3.11 for the version probe, the fixture generator, the throwaway
provider and the query script.

**Primary Dependencies**: `shapely` at and below the pinned version, built against known GEOS
versions; pygeoapi in its published container image; `xarray` and `netCDF4` to write the fixture;
`numpy` for the analytic field; `httpx` to issue queries. None becomes a drogna dependency by being
used here; the version pin it recommends does.

**Storage**: One committed NetCDF fixture under 5 MB, plus captured requests, responses and hand-off
records as files under the spike directory.

**Testing**: The version probe is the test, and it is written so the deployment can adopt it as the
assertion FR-51 requires. A self-check confirms the fixture matches its analytic form and that the
two hypotheses are separated by the required margin. There is no `pytest` suite in the spike itself.

**Target Platform**: A container runtime on the author's machine. The spike never runs on the
droplet and never enters the Compose configuration.

**Project Type**: Throwaway investigation with a written deliverable and one adoptable test.

**Performance Goals**: None. The fixture is sized so a query answers in seconds.

**Constraints**: One command to run. No dependency on `harness_core`, the clock service, the broker
or the environment generator, none of which exists at this point in the delivery order. Under 5 MB
committed.

**Scale/Scope**: One collection, one parameter, one route of the order of twenty vertices, two
Shapely and GEOS version combinations.

## Constitution Check

*GATE: assessed before work begins; one recorded violation, argued below.*

- **I. No Wall-Clock Time**: The spike has no operational code path and publishes nothing. Its
  fixture times and its vertex times are explicit values, not readings of a host clock. `spikes/` is
  excluded from the gate by the shared exclusion list owned by feature 001. Compliant in substance.
- **II. Seeded Randomness**: The fixture generator takes a fixed seed, recorded in the fixture
  metadata and in the finding, so the reproduction reproduces. Compliant.
- **III. Generated Types Only**: The spike hand-writes throwaway request and response handling and
  crosses no language boundary. Nothing it writes is a shared type. Compliant.
- **IV. No Literal Paths or Hosts**: Violated deliberately inside `spikes/edr-trajectory/`. See
  Complexity Tracking.
- **V. No Tracked Entities**: The fixture is one synthetic scalar field carrying a metadata
  attribute that says so. Compliant.
- **VI. Honest Ports**: The bespoke trajectory provider sits behind the coverage output port, which
  is one of the four ports the constitution names as genuine. This spike introduces no new
  abstraction: it registers a throwaway plugin at a seam pygeoapi already provides, and it writes
  down that seam for the build rather than wrapping it. Compliant.
- **VII. Liveness, Not Configuration**: The spike is not a component. It publishes no heartbeat,
  lights nothing in the client, and its throwaway provider never feeds synthesised traffic to
  anything drogna displays. Compliant.
- **VIII. Recommendations, Not Decisions**: Not touched.
- **IX. Ground Truth Is Scored, Not Assumed**: The route's returned values are scored against an
  analytic expectation computed from the fixture's known form, with a stated tolerance and a stated
  discriminating margin, rather than judged plausible by eye. This is the discipline AT-01 will apply
  against the generator's manifest, rehearsed early. Compliant.
- **X. Default Deny**: The spike exposes a container on a local port only, never on the droplet, and
  is not part of any deployed configuration. Compliant.

## Project Structure

### Documentation (this feature)

```text
specs/002-edr-trajectory-spike/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
spikes/edr-trajectory/
├── README.md                     the question, the one command, how to read the output
├── version_probe.py              parses LINESTRINGZM at and below the pin; the adoptable test
├── compose.spike.yml             pygeoapi container plus the version matrix, local only
├── pygeoapi.spike.yml            collection configuration selecting the throwaway provider
├── provider_stub.py              throwaway EDR provider: records the hand-off, answers a route
├── make_fixture.py               seeded analytic 4D field, written as CF NetCDF
├── expectation.py                analytic evaluation: per-vertex and single-time hypotheses
├── query.py                      issues the trajectory query, captures request and response
├── selfcheck.py                  fixture matches its analytic form; hypotheses are separated
├── fixture/                      the committed NetCDF fixture and its metadata
├── results/                      captured probes, requests, responses and hand-off records
└── findings-YYYY-MM-DD.md        the dated finding: result, evidence, handover to the build
```

**Structure Decision**: This feature owns `spikes/edr-trajectory/` and nothing else. It creates no
service, no library, no contract and no configuration outside that directory. Two things leave it:
the ADR carrying the decision, which is additive under the repository ownership rule and is what
remains when the spike directory is deleted, and the version-probe test, which the deployment
feature adopts to satisfy FR-51. The real provider plugin is built under `query/` by the query-layer
feature; nothing in this directory is promoted into it.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Literal paths, hostnames and ports inside `spikes/edr-trajectory/` (Constitution IV) | The spike must run standalone with one command, before `harness_core`'s config loader exists, and its value depends on a reader seeing exactly what was requested of which endpoint at which version | Routing a throwaway investigation through the named-config mechanism would couple it to feature 001, delay a proof that blocks the query layer, and hide the request URL and version strings the finding must quote verbatim |

## Handover

The finding is written to be consumed, not filed. It carries: the provider base class and the
methods the real plugin must implement; where that plugin lives and how a collection selects it;
what FR-21 requires of the collection configuration so a new run becomes servable without editing
it; the vertical convention the provider must reconcile; the interpolation choice and its effect on
AT-01's reported error; the version pin with the comment FR-51 requires; and the parsing test the
deployment adopts. The decision that drogna builds this provider at all earns an ADR under PR-03, as
the SRD's §5.3 note states.
