# Operator-plane spike

**The question**: can an operator force components to fail, throttle or surge — and can the
result be trusted — without Constitution VII being bent? And does that want a REST
interface?

**The answer**: the round trip works, and the client needed **no change at all** to show
it, which is the risk this spike expected to find and did not. What is missing is narrower
than it looked: three of the four things asked for already have mechanisms, and the one
genuinely absent capability is any way to ask a component to misbehave. The shape that fits
is the one the repository already uses for the clock's rate — request over HTTP, effect
observed on the broker, and the component decides. Read [FINDING.md](FINDING.md).

## Run it

```bash
./run.sh
```

Needs `uv sync` at the root and `pnpm install` in `client/`. No Docker, no network, no
browser. About a minute.

It writes into `libs/harness_core/` and `client/tests/` for the length of the run and
removes what it added afterwards, including when it fails part way through. It refuses to
start if any file it would create already exists.

## This is spike code

Throwaway, and marked as such at the top of every file. Nothing here is imported by drogna
and nothing here is promoted into it. The candidate is written *as it would appear* at
`libs/harness_core/src/harness_core/fault.py` so that the repository's own gates, suites and
linters can be pointed at it — the question is not "does this work" but "does this survive
the checks".

## What is here

| File | What it is |
|---|---|
| `run.sh` | The one command. Grafts, proves both ends, plants two violations, restores. |
| `candidate/fault.py` | The impairment a component holds and consults. Publishes nothing; there is no argument a console could reach a heartbeat through. |
| `proof/test_fault_roundtrip.py` | Fourteen tests. Every heartbeat composed by the real `HeartbeatPublisher` and validated against the real master. |
| `proof/faultDisplay.test.ts` | Eight tests. Four provocations through the client's own `interpret`, `receive`, `describeShell` and `statusWords`. |
| `results/` | What the run produced, including both gates catching their planted violations. |

## What was proved

```
component end, impairment reaches a validated heartbeat:  PASS   (14 tests)
display end, four provocations distinguishable:           PASS   (8 tests)
harness_core suite with the candidate present:            PASS   (131 tests)
client suite with the candidate present:                  PASS   (454; 446 before)
ruff check and format:                                    PASS
all constitution gates:                                   PASS   (13)
Constitution I, host clock planted:                        CAUGHT
no-mocked-traffic, console planted:                        CAUGHT
both green again once the plants are removed:             PASS
```

Two different checks were watched failing on two different plants: `time.time()` inside the
fault state, which the wallclock gate named by file and line; and a console module under
`client/src` that composed a heartbeat, which `tests/no-mock.test.ts` refused by name.

The two rules worth carrying out of here: **truth is monotone downward** — an impairment can
worsen a reported status and never improve one, so the plane can provoke a failure and never
conceal one; and **an injected impairment says so in the message**, because a provoked
degradation and a genuine one report the same status and nothing else could tell them apart.
