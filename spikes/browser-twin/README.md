# Browser-twin spike

**The question**: can drogna's downstream browser visualisations be developed and
*verified* without a backend — by reimplementing the subsystems as JavaScript components
running in the browser — without abandoning Constitution VII, which forbids mocked traffic
from ever driving illumination?

**The answer**: yes, and the constitution is not the obstacle. The obstacle is one
boundary, which this spike found by running into it: the component twins cannot live
inside `client/src`, because the client's own tests forbid any file there from publishing.
That is the right boundary for a better reason than the one that would have put them
there. Read [FINDING.md](FINDING.md).

Two of its twelve findings came from questions put to the spike rather than from the run,
and are argued rather than proved: **F11**, that publishing each pull request to its own
`gh-pages` folder is how stage one reaches anybody — and that only a twin makes such a
preview possible, since the site's own gate forbids an off-origin request and a page on
`github.io` may not open one anyway; and **F12**, that the seam between a browser front end
and either backend already exists, amounts to one document, one subscription and two
fetches, and should not be replaced by a bespoke REST API.

## Run it

```bash
./run.sh
```

Needs `pnpm install` to have been run in `client/`, and `uv sync` at the root. No Docker,
no network, no part of the harness running. About twenty seconds. Everything it learns
lands in `results/`.

It writes into `client/` for the length of the run and restores it from git afterwards,
including when it fails part way through. It refuses to start if any file it would touch
differs from HEAD.

## This is spike code

Throwaway, and marked as such at the top of every file. Nothing here is imported by drogna
and nothing here is promoted into it. The candidate files are written *as they would
appear* in the client so that the client's own gates can be pointed at them, which is the
whole trick: the question is not "does this work" but "does this survive the checks", and
the only way to answer that is to put it where the checks can see it.

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Grafts, proves, plants a violation, restores. |
| `candidate/bus.ts` | The in-page fabric as a `BrokerClient`, as it would appear at `client/src/transport/bus.ts`. Publishes nothing, and can be read to check it. |
| `candidate/mqtt.patch` | The whole change to the client: choose the connector from the URL in the served document. 41 lines with context. |
| `candidate/clockTwin.ts` | C-01 reimplemented, as it would appear at `client/twin/clockTwin.ts` — outside `src`, for the reason F3 gives. |
| `proof/busTransport.test.ts` | Eight tests that run the component and ask the real shell view what is lit. |
| `results/` | What the run produced, including the gate failing on the planted violation. |

## What was proved

```
client suite with candidate present:       PASS   (47 files, 454 tests; 446 before)
typecheck:                                 PASS
lint:                                      PASS
constitution gates over client/src:        PASS
no-mocked-traffic test, violation planted:  CAUGHT
no-mocked-traffic test, violation removed:  PASS
```

The proof test does not construct a heartbeat and hand it to the reducer — FR-023 says
plainly that feeding a value to a pure function is testing a function. It runs a clock
component that computes its own output onto a real `BroadcastChannel`, and the client does
the rest of the way itself.
