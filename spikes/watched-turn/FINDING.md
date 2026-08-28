# Finding: the loop's first turn, watched — a breach became a published run in the client

**Run date**: 28 August 2026

**Spike**: none — this is the observation the delivery plan names as lane H's first act:
SRD §10's gate criterion seen happening, never inferred from green tests. It opens wave 8.

**Reproduction**: from this tree, `dockerd &`, `export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"`,
`./scripts/run_local.sh` twice (convergence is part of the behaviour), and a browser — or the
read-only page watcher described below. Every claim is a file in `results/`.

---

## The result, in one sentence

From one command against a clean checkout, a threshold breach became `ctl/divergence` →
`ctl/run-request` → `ctl/run-started` → `ctl/run-published`, live in the composed stack,
and the traversal was watched and captured **in the client's own loop view** — sense,
decide, act and publish each lit by the message that marks it, with the announcement's run
becoming servable coverage on the EDR cube.

## The method

Two scenario runs were watched. The first ran on the merged tree (PR #33's images); the
second on this branch's rebuilt images after a `./scripts/down.sh local --volumes` reset,
so it also validates the link-5 announcement live (see below). Three instruments, all
read-only:

- a broker subscription on the four run topics (`results/ctl-messages.txt` is the second
  scenario's complete record);
- a Playwright page holding the running client open across the turn, polling the loop
  view's DOM (`data-testid="cycle-phase-*"`) every 40 ms, logging each state change and
  screenshotting each activation (`results/loop-view-transitions.jsonl`, the three
  `loop-view-*.png`);
- the glance mechanism, unmodified, for the mechanism's own record with the rate in force
  printed beside the image (`results/glance.png`, `results/glance-tall.png` — the second
  through a session-local capture configuration whose only differences are a 3400 px
  viewport and scale factor 1, so the loop view is inside the frame).

## What was watched (second scenario, all times simulation time)

| Real (UTC) | Sim | Message | Detail |
|---|---|---|---|
| 17:05 | 00:06:35.5 | `ctl/run-published` | `run-initial`, the seed step's field, current — retained, so the fresh page's publish phase lights on arrival |
| 17:06:21 | 00:12:06.6 | `ctl/divergence` | `190074a65bdedf86` against `run-initial`: mean residual −7.28 m/s over threshold 1.75 |
| 17:06:21 | 00:12:06.7 | `ctl/run-request` | scheduler asks for `run-000000-7f80b47c7b91`, carrying the divergence |
| 17:06:21 | 00:12:06.7 | `ctl/run-started` | model runner begins, 8 members |
| 17:06:27 | 00:13:13.4 | `ctl/run-published` | `run-000000-7f80b47c7b91` current — 66.7 s of simulation from breach to visibility |
| 17:07:21 | 00:22:06.2 | `ctl/divergence` | `11de25f7c64153fd` against `run-000000`: the next breach |

In the client's loop view, the same turn read (from `loop-view-transitions.jsonl`):

1. **publish active** on page open — the retained `run-initial` announcement;
2. **decide reached, act active** at sim 00:12:07.2 (`loop-view-act.png`) — the breach's
   request accepted and the run begun; sense had flashed in the same render frame, since
   divergence, request and start are one tick of simulation apart;
3. **decide and act reached, publish active** at sim 00:13:13.6
   (`loop-view-publish.png`) — the run visible and announced;
4. **sense active with decide, act and publish all reached** at sim 00:22:06.5
   (`loop-view-sense-all-reached.png`) — the *next* breach arriving against the run the
   watched turn published, all four phases of the cycle lit at once, and the message
   inspector showing the `ctl/divergence` payload validating against its schema.

The first scenario had already shown the same chain on the merged tree (divergence
`190074a65bdedf86` → `run-000001-6ab42ca09e7d`, watched at the broker; the client received
the announcement and named its collection in its own words on the map panel). The
divergence identifier repeating across the two scenarios is Constitution II doing its job:
same seed, same ocean, same first breach.

## The cube serves the watched run

`results/edr-cube.json`:
`GET /collections/forecast/cube?bbox=-4.6,48.9,-4.4,49.1&z=0/50&parameter-name=temperature_uncertainty`
answers 200 with a CoverageJSON Grid whose time axis begins at the watched run's
initialisation instant. 008 T062's claim — the EDR collections serve real coverage — is
now measured against a run the loop itself produced while being watched.

## The link-5 announcement, live

The second scenario ran this branch's images, so its announcements are the amended master:
`"collections": {"forecast": "forecast"}` with the run named separately by `run_id`, and no
`collections.uncertainty` anywhere (`results/ctl-messages.txt`, both `run-published`
lines). The client validated and folded every one — `0 refused by their schema` on the
page's own counter, visible in the captures.

## The seed step, converged and refusing (issue #34 link 1)

`results/seed-convergence.txt`: `030-coverage.sh` on a fresh store authors `run-initial`
through the publisher's own path; on the second `run_local.sh` it reports the store
already current and seeds nothing; both runs exit 0.

`results/tamper-refused.txt`: two tampered staged runs planted in the running stack, both
refused by the live publisher and discarded, the pointer untouched. The second is the
digest case exactly: a well-formed descriptor whose forecast bytes were altered after its
digest was recorded — refused with *"the forecast field does not match the digest its
descriptor records"*. The guard is the publisher's inspection, which is the same guard the
seed path runs through; like `010-observations.sh`'s digest guard, it was watched refusing
rather than trusted.

## Two observations the pleasure of the turn must not bury

**The scheduler declined the next breach, correctly.** Divergence `11de25f7c64153fd`
(sim 00:22:06) drew no run-request: 600 s of simulation after the last request, inside
`minimum_interval_seconds: 1800`. That is `policy.py`'s `MINIMUM_INTERVAL` verdict doing
what it says. Recorded so the quiet that follows a turn is not misread as a stall.

**The loop can become permanently becalmed, and the first scenario watched it happen.**
The first scenario's last run (`run-000001`, valid 00:27–06:27) drew no accepted breach
inside its validity. At sim 06:35 — past the span — the loop was still quiet, and from
that point it can never turn again at this destination: the monitor samples the forecast
multilinearly on all four axes and `ForecastField.covers()` answers false for every
observation after the span's end, so no residual is ever scored, no divergence can fire,
and nothing else in the harness requests a run. Every component meanwhile reports
healthy — monitor "scoring", scheduler "idle", publisher "current run-000001". This is a
live-only behaviour no in-process test exercises: whether the monitor should score against
a lapsed field, or the scheduler should hold a cadence, or the calm is the intended end
state of a scenario's day, is feature 009's question and is deliberately recorded here as
open rather than answered from this lane.

## What this cost

About ninety minutes against the running stack, most of it waiting on simulation time —
which is itself a datum: at rate 10, breach-to-publication is ~6.7 s of wall clock, and the
gaps between breaches are minutes. Nothing in the stack was modified to take any
measurement; the two scenario resets used the deployment's own scripts.
