# Service-worker spike

**The question**: the browser-twin spike closed the control half of the client's seam and
left the HTTP half open. Can a service worker serve the query layer and the clock's HTTP
interface, from a static deployment with no backend, reliably enough to build on?

**The answer**: yes. Every mechanism works, including the ones that looked riskiest. What
it does not remove is a race — a first visit has a window with no query layer — and the fix
changes the startup sequencing FR-019 pins. Read [FINDING.md](FINDING.md).

## Run it

```bash
./run.sh
```

Needs `pnpm install` in `client/`, `uv sync` at the root, and the Chromium that Playwright
already uses. No Docker, no network, no certificate: `http://127.0.0.1` is a secure context
by definition, which is why a worker runs there at all. About fifteen seconds.

It serves `served/`, copies the candidate worker in, grafts the specs into
`client/e2e/spike/`, and removes both afterwards — including when it fails part way
through. It refuses to start if either location already exists.

## This is spike code

Throwaway, and marked as such at the top of every file. It hardcodes paths and does not use
drogna's configuration contract. Nothing here is imported by drogna and nothing here is
promoted into it.

The specs are grafted into `client/e2e/spike/` rather than run where they sit, and that is a
finding rather than a convenience: `spikes` is in the gates' shared exclusion list, so
`check_no_fixed_sleep.py` pointed at this directory reports clean because it reads nothing.
G5 has the detail.

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Serves, grafts, proves, plants a delay, restores. |
| `candidate/sw.js` | The worker as a preview would ship it: EDR collections and trajectories, the clock snapshot and rate. |
| `served/` | A tree laid out as per-pull-request previews would be — two previews and a site root — so scope isolation is testable. |
| `proof/worker.spec.ts` | Nine specs: scope, the race, the wire, the refusals, and a browser that will not run a worker. |
| `proof/server.mjs` | A static server. Binds port zero and reports the port, so two runs never collide. |
| `results/` | What the run produced, including the gate catching a planted delay. |

## What was proved

```
worker specs (scope, race, wire, blocked):  PASS   (9 specs)
specs typecheck:                            PASS   (as part of client/e2e)
fixed-sleep gate over the specs:            PASS
fixed-sleep gate, delay planted:             CAUGHT
fixed-sleep gate, delay removed:            PASS
```

One spec failed on the first run and was right to. It asserted that the page would have to
be *claimed* by the worker; the controller was already set by the time
`navigator.serviceWorker.ready` resolved. Which of the two happens is a timing detail rather
than a guarantee, so the assertion was replaced by one that does not depend on it — a test
that passes on this machine and fails on a slower one is worse than no test.
