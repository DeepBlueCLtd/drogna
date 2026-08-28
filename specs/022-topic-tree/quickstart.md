# Quickstart: seeing the topic tree work, and proving it honest

## Prerequisites

- The repository, `uv sync`, and `cd client && pnpm install`.
- For the live half: a Docker daemon (`dockerd >/tmp/dockerd.log 2>&1 &` in this
  container) and `export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"` before any build.

## The state-layer proof (the feature's chosen verification, FR-011)

```sh
cd client
pnpm exec tsc --noEmit && pnpm lint
pnpm test -- tests/topictree
```

Expected: skeleton, matching, activity/crossover, detail, honesty and read-only suites
pass — and each was watched failing on a planted fault before being trusted (the commit
messages say which fault).

## The derivation chain

```sh
uv run python scripts/check_topology_drift.py   # clean after regeneration
uv run pytest tests/unit -k topology
```

Expected: the drift gate reports the artefact matching the tree, topics now including
the configured `obs/<thing>/<datastream>` rows and the `drogna_observer` role. During
development the gate was watched failing between the role/expansion edits and the
regeneration — that failure is the safety FR-001 leans on.

## The role at a running broker

```sh
uv run pytest tests/integration/test_topic_isolation.py
```

Expected: `drogna_observer` receives on `obs/#` and `ctl/#`; every publish it attempts is
refused. (Container-backed; skips loudly without a daemon.)

## Live, end to end (SC-001)

```sh
./scripts/run_local.sh
# open the client (config/local/deployment.json's public_url), watch the topic tree panel
HARNESS_CONFIG=config/local/capture.json node scripts/capture/glance/run.mjs
```

Expected, with the stack cycling:

1. On first paint the full declared tree and the full role column are drawn, cold —
   including observation leaves that have not yet spoken.
2. When an observation lands on `obs/<thing>/<datastream>`, that leaf pulses, its
   ancestors ripple, and exactly the roles whose declared filters match light their
   connections; roles with no matching filter do not change.
3. Every stated rate and last-seen is in simulation time with the acceleration factor
   shown beside it; changing the clock rate (speed control) changes no stated
   per-simulation-time figure; pausing states the pause.
4. Killing the broker connection (e.g. `./scripts/down.sh local`) makes the panel state
   the disconnection rather than showing a quiet system.
5. The glance capture shows the panel beside the existing surfaces, which are unchanged.
