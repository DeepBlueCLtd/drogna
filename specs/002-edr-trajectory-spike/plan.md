# Implementation Plan: EDR Trajectory Spike

**Branch**: `002-edr-trajectory-spike` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-edr-trajectory-spike/spec.md`

## Summary

Answer one question with evidence: does pygeoapi's OGC API-EDR implementation honour per-vertex
timestamps on a trajectory query, as FR-20 requires? The method is a self-contained reproduction —
a small synthetic four-dimensional NetCDF coverage, a pygeoapi container serving it as an EDR
collection, and a query script that issues the trajectory request and prints the response beside
the two competing expectations. The fixture is designed so that a response evaluated at a single
time cannot be mistaken for one evaluated per vertex.

The deliverable is a dated finding in `spikes/edr-trajectory/`, carrying the verdict, the evidence,
five costed options and one recommendation, transcribed into an ADR. The options are written to the
same standard as the happy path, because the SRD says the read path and the client's centrepiece
both change shape if the answer is no, and that change of shape is the actual output of this spike.

## Technical Context

**Language/Version**: Python 3.11 for the fixture generator and the query script. No TypeScript;
the client consequence is assessed on paper, from the response body.

**Primary Dependencies**: pygeoapi in its published container image; `xarray` and `netCDF4` to write
the fixture; `numpy` for the analytic field; `httpx` to issue queries. None of these becomes a
harness dependency by virtue of being used here.

**Storage**: One committed NetCDF fixture under 5 MB, plus captured responses as files under the
spike directory.

**Testing**: A single self-check script that verifies the fixture matches its analytic form and
that the two hypotheses are separated by the required margin. There is no `pytest` suite: the spike
is throwaway and its assertion is the finding.

**Target Platform**: A container runtime on the author's machine. The spike never runs on the
droplet and is never part of the Compose configuration.

**Project Type**: Throwaway investigation with a written deliverable.

**Performance Goals**: None. The fixture is sized so a query answers in seconds.

**Constraints**: One command to run. No dependency on `harness_core`, the clock service, the broker
or the environment generator, none of which exists at this point in the delivery order. Under 5 MB
committed.

**Scale/Scope**: One collection, one parameter, one trajectory of the order of twenty vertices.

## Constitution Check

*GATE: assessed before work begins; one recorded violation, argued below.*

- **I. No Wall-Clock Time**: The spike has no operational code path and publishes nothing. Its
  fixture times are explicit values, not readings of a host clock. `spikes/` is excluded from the
  gate by the shared exclusion list owned by feature 001. Compliant in substance.
- **II. Seeded Randomness**: The fixture generator takes a fixed seed and records it in the fixture
  metadata and the finding, so the reproduction reproduces. Compliant.
- **III. Generated Types Only**: The spike hand-writes throwaway request and response handling and
  crosses no language boundary. Nothing it writes is a shared type. Compliant.
- **IV. No Literal Paths or Hosts**: Violated deliberately inside `spikes/edr-trajectory/`. See
  Complexity Tracking.
- **V. No Tracked Entities**: The fixture is one synthetic scalar field with a metadata attribute
  saying so. Compliant.
- **VI. Honest Ports**: No abstraction is introduced. The spike talks to pygeoapi directly.
  Compliant.
- **VII. Liveness, Not Configuration**: The spike is not a component, publishes no heartbeat and
  does not appear in the client's component layout. Compliant.
- **IX. Ground Truth Is Scored, Not Assumed**: The spike computes its expectation analytically from
  the fixture's known form and compares numbers, rather than judging plausibility by eye. This is
  the same discipline AT-01 will apply, exercised early. Compliant.
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
├── compose.spike.yml             pygeoapi container, local only
├── pygeoapi.spike.yml            collection configuration for the fixture
├── make_fixture.py               seeded analytic 4D field, written as CF NetCDF
├── expectation.py                analytic evaluation: per-vertex and single-time hypotheses
├── query.py                      issues the trajectory query, captures request and response
├── selfcheck.py                  fixture matches its analytic form; hypotheses are separated
├── fixture/                      the committed NetCDF fixture and its metadata
├── results/                      captured requests and responses, one file per run
└── findings-YYYY-MM-DD.md        the dated finding: verdict, evidence, options, recommendation
```

**Structure Decision**: This feature owns `spikes/edr-trajectory/` and nothing else. It creates no
service, no library, no contract and no configuration outside that directory. The one file it adds
elsewhere is the ADR carrying the recommendation, which is additive under the repository ownership
rule and is what remains when the spike directory is deleted.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Literal paths, hostnames and ports inside `spikes/edr-trajectory/` (Constitution IV) | The spike must run standalone with one command, before `harness_core`'s config loader exists, and its value depends on a reader being able to see exactly what was requested of which endpoint | Routing the spike through the named-config mechanism would couple a throwaway investigation to feature 001, delay the load-bearing answer behind unrelated work, and hide the request URL that the finding must quote verbatim |
