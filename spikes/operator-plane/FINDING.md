# Finding: a fault is a state the component enters, and the display already knows how to show it

**The question.** An operator plane: force components to fail, throttle or surge; track
their throughput; browse store contents; see the current set of NetCDF outputs, including a
new one arriving. Does that want a REST interface, and does one survive Constitution VII?

**The answer.** The round trip works, and the client needed no change at all to show it —
which was the risk this spike expected to find and did not. What is missing is narrower
than it looked: three of the four things asked for already have mechanisms, and the one
genuinely absent thing is any way to *ask a component to misbehave*. The shape that fits is
the one the repository already uses for the clock's rate: **request over HTTP, effect
observed on the broker, and the component decides.**

---

## What was proved, and how to see it

`./run.sh` grafts a candidate `FaultState` into `libs/harness_core/`, a round-trip test
beside the library's own, and a display test into `client/tests/`; runs both suites, ruff
and all thirteen gates; plants two violations and watches two different checks catch them;
then restores the tree.

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

Every heartbeat asserted on in the Python half is composed by the repository's own
`HeartbeatPublisher` and validated against the repository's own schema. Nothing constructs
a message by hand, so a shape the contract would refuse fails here rather than passing
quietly.

## O1 — Three of the four already exist; only the middle is missing

| Asked for | What is already there | Gap |
|---|---|---|
| NetCDF outputs, including a new one arriving | `stores/coverage/layout.md` — `current`, `runs/`, `staging/`. FR-21 makes a new run servable with no configuration edit; it is announced on `ctl/run-published` and listed by EDR `/collections` | The files are not exposed *as files*; the events and the collections are |
| Throughput | `ctl/telemetry`, a nine-kind discriminated union | It carries *domain* telemetry — residuals, scheduler decisions, run failures, publication refusals, forecast skill. Component throughput is not one of the kinds. The channel exists; the kind does not |
| Store contents | Observations through SensorThings (ADR-0004) | No generic browser, and see O7 |
| Force fail / throttle / surge | **Nothing.** `services/clock/src/harness_clock/http.py` is the only HTTP interface any service has, and its docstring calls it "two routes, and a deliberate refusal to be more" | Entirely absent |

So the operator plane is mostly a console over surfaces that exist, plus one genuinely new
capability.

## O2 — A fault is a state the component enters, not a status a console sets

The repository already shows the shape, in `services/planner/src/harness_planner/publish.py`:

```python
def heartbeat_status(state: PlannerState) -> HeartbeatStatus:
    """``no-field`` is degraded rather than ok: the process is alive and is doing
    nothing useful, and saying so is the difference between a component that is
    working and one that is merely running."""
```

A pure function from the component's *own* state to a status. An impairment joins that
state; it does not bypass it. The whole integration is three calls inside the component's
existing publish path — `expire`, `publishes`, and `status_for`/`detail_for` — and there is
no argument through which a console could reach a heartbeat directly.

That is what keeps Constitution VII intact. The display goes on saying what the component
said about itself. The console asks; the component answers; and the answer may be no — a
request for another component, or one carrying no reason, is refused, exactly as the clock
may clamp or refuse a rate (FR-49).

## O3 — Truth is monotone downward, and that is testable

`status_for` may worsen a status and can never improve one. Three assertions hold it shut:

- a console asking for `none` cannot talk a genuinely degraded planner into reporting `ok`;
- a `degrade` request cannot soften a component that is already `stalled`;
- `starting` and `stopping` are lifecycle statements rather than health ones and are left
  alone, because a component being asked to degrade while it is still starting is still
  starting.

The operator plane can provoke a failure and can never conceal one. That asymmetry is the
reason it is safe to have at all.

## O4 — An injected impairment must say so in the message

A provoked degradation and a genuine one both report `degraded`. **The status alone cannot
tell them apart**, and if nothing else could either, then every demonstration would corrupt
the record the harness exists to produce.

So the mark goes in the `detail`, which the client already carries as `Evidence.detail` and
already keeps through to the view. Proved from both ends: the component publishes
`impairment-requested: degrade (reason)`, and the display test asserts that a provoked
degradation carries the mark while a genuine `no-field` one does not — with both reporting
the same status, which is the point.

## O5 — Four provocations, four distinguishable displays, and the client needed no change

This is where the spike expected to find work and did not. `Illumination` is
`lit | dark | indeterminate | self`, with no health in it, so the first guess was that a
degraded component would look identical to a healthy one. It does not.
`layout/ComponentDiagram.tsx:40` pushes `statusWords(view.reported.status)` under every
box, `ui/states.ts` maps `degraded` to "reports degraded", and the diagram says so in its
own comment: *"while failing at its job is lit, and says so in its reported status."*

| Provocation | Illumination | What the box says |
|---|---|---|
| `degrade` | lit | reports degraded |
| `stall` | lit | reports stalled |
| `silence` | **dark**, once the window lapses | the last thing it said, unchanged |
| `throttle` | lit | reports ok — slow is not sick |

`silence` is the interesting one: dark means "not heard from", which is a different and
equally true claim from "failed", and the display does not diagnose the difference. It is
also the provocation an operator most often wants, and it needs no new vocabulary at all —
the component simply stops publishing and liveness does the rest.

A status the client does not recognise is shown as it arrived — `statusWords("wedged")` is
`"reports wedged"` — rather than folded into `ok`, so a component saying something new is
visible as new.

## O6 — Expiry is simulation time, and the gate proves why that matters

`expires_after_ticks`, never host seconds. Two reasons, and the second is the one that
would have bitten: Constitution I admits no host clock in operational code, **and** an
impairment measured in real seconds behaves differently at every clock rate, so the same
demonstration at rate 10 would outlast itself at rate 1.

Planted `time.time()` inside the fault state and watched the gate name it:

```
libs/harness_core/src/harness_core/fault.py:175: [wallclock] time.time() — reads the host
clock; simulation time comes from harness_core.clock.Clock, which is a subscriber to ctl/clock
```

The second plant was a console module under `client/src` that composed a heartbeat, and
`tests/no-mock.test.ts` refused it by name. Both went green when the plants were removed.

## O7 — What this does not build, and the one thing that needs care

- **The HTTP endpoint itself.** Not built. `services/clock/src/harness_clock/http.py` is the
  shape to copy: two routes, an explicit refusal to grow more, and route naming that lets
  the reverse proxy apply policy by prefix without enumerating routes (FR-007).
- **Throughput as a telemetry kind.** Not built. It is an addition to an existing
  discriminated union rather than a new channel, which is the cheap half of this.
- **The store browser is the one to be careful with.** A generic, pgAdmin-style surface is
  the precise inverse of the default-deny exposure boundary that C-10, ADR-0001 and
  Constitution X exist to demonstrate. It belongs *inside* the boundary — local only, never
  behind the released prefix. Otherwise the harness ends up demonstrating an architecture it
  does not recommend, which is worse than not having the feature.
- **A surprise worth recording**: `spikes` is in the gates' shared exclusion list but is
  **not** excluded from `ruff`. This spike's own proof file was linted and had to be fixed
  before the run went green. The asymmetry is right — ruff is a style tool, the gates are
  about the system — but it is not obvious, and the service-worker spike found the opposite
  half of the same fact.

## O8 — In the twin, nearly all of it is free

Fault injection in the browser twin is a message to a worker. Throughput is a counter the
component already keeps. Store contents are an object. A new NetCDF arriving is the
publisher twin announcing a run. No HTTP inside the twin at all — the console talks to the
components on the same `BroadcastChannel` they already publish on.

So this is the same one-interface-two-implementations shape as the browser-twin spike's
F12, and it **inverts F12's conclusion**. There, the client's data path already had a
declared contract and the answer was "do not build an API". Here nothing exists, so a
declared contract genuinely is needed — and it should be declared the way everything else
here is: a master under `contracts/schemas/`, generated types, registered in
`tests/unit/test_generated_models.py`, so the real services and the twin implement one
thing and cannot drift.

## Cost

| Piece | Shape |
|---|---|
| `FaultState` and the three calls in each component's publish path | Small, and proven here. Eleven services, one pattern. |
| The fault-request contract: master, generation, registration | Half a day, and it is the piece that keeps the two implementations honest. |
| One HTTP route per component, copying the clock's | Mechanical. The proxy policy question is the only judgement in it. |
| Throughput as a telemetry kind | Small: an addition to an existing union. |
| The console itself | The bulk, and it lives outside `client/src` for the reason the browser-twin spike's F3 gives. |
| A store browser, inside the boundary | Defer. It is the one item that can damage the thing being demonstrated. |

## Recommendation

Make it the third stage, after the loop and the wire, and specify it with the contract
first: the fault request is the only genuinely new shape, and everything else is a console
over surfaces that already exist.

Build `FaultState` before the console. It is small, it is proven, and it is the piece that
decides whether the whole plane is honest — because once the component owns the decision,
no console written later can lie on its behalf.
