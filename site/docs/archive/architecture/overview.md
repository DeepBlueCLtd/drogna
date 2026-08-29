---
title: Architecture overview
---

# Architecture overview

drogna is an event-driven **control loop** with **command–query separation**.
Those two phrases are the whole architecture, and the rest of this page is what
they mean concretely, drawn as a flow rather than as a box diagram, because the
interesting property of this system is temporal.

Eighteen components are described one at a time in the
[subsystem reference](../subsystems/index.md). This page is about how they fit
together, and — in the last section — about how much pluggability the fitting
actually buys, which is less than a diagram of this shape usually implies.

## The loop

The organising picture is a flow chart **with a loop in it**, not a hexagon. A
static structural diagram of drogna would show the same components a hundred other
systems have; what distinguishes it is the cycle, and a picture that cannot show
a cycle cannot show the point.

```text
  ┌─▶ 1  SENSE
  │       Simulated sensors sample the generated world at the platform's
  │       position and publish readings on  obs/<thing>/<datastream>.
  │
  │       Two consumers, on purpose:
  │         • the ingest client validates and batch-writes to the
  │           observation store — the single ingestion seam
  │         • the monitor subscribes to the same topics directly and
  │           keeps a rolling window in memory
  │            │
  │            v
  │   2  DECIDE
  │       The monitor computes the residual between measured and forecast
  │       sound speed — not temperature — and raises  ctl/divergence  only
  │       when the residual persists in space or time. A single spike never
  │       triggers a run. The monitor raises requests; it never invokes the
  │       model.
  │            │
  │            v
  │       The scheduler enforces a minimum interval between runs and rejects
  │       a duplicate outstanding request, then raises  ctl/run-request.
  │            │
  │            v
  │   3  ACT
  │       The model runner announces  ctl/run-started  before computing
  │       anything, runs the ensemble, and writes the forecast and
  │       uncertainty fields into staging — and nowhere a reader can see.
  │            │
  │            v
  │   4  PUBLISH
  │       The publisher makes the completed run visible in one atomic step,
  │       marks it current, and announces  ctl/run-published. Consumers
  │       subscribe; nothing polls the query layer for freshness, because the
  │       query layer has no notification mechanism.
  │            │
  └────────────┘
        The newly published forecast is what the monitor scores the next
        observations against. That is what closes the loop.
```

Three properties of that cycle are worth pulling out, because each is a decision
that could have gone the other way.

**Nothing polls.** Every stage is entered because something announced that the
previous one finished. The publisher's announcement is what tells the monitor its
comparison target has changed, what tells the [planner](../subsystems/c15-planner.md)
there is a new uncertainty field to plan against, and what tells the browser client
to redraw. A polling design would have worked and would have hidden every timing
question this one makes visible.

**Each stage may decline.** The monitor may see a residual and stay quiet because
it has not persisted. The scheduler may see a divergence and refuse because a run
happened too recently. The planner may compute a route and publish an empty one
because nothing was worth sampling. A loop in which every stage always fires is a
loop with no policy in it.

**The monitor reads the topics, not the store.** It subscribes to observations
directly and holds its window in memory, rather than querying the observation
store during normal operation. This is the sharpest instance of the separation in
the next section: the monitor is inside the system, and the store's read interface
is for the outside.

## Command–query separation

Two paths, and they do not meet.

```text
   WRITE PATH — commands                    READ PATH — queries

   simulated sensors                        browser client
        │  obs/<thing>/<datastream>              │  HTTPS
        v                                        v
   ingest client                             reverse proxy
        │  the single ingestion seam:            │  TLS, authentication,
        │  validate, batch, write                │  path policy, default deny
        v                                        v
   observation store  ◀───── select only ──  query layer (pygeoapi)
   coverage store     ◀───── read only  ───────┘
        ▲                                        │
        │  atomic swap                           │  SensorThings over observations
   publisher                                     │  OGC API-EDR over coverages
                                                 v
                                            CoverageJSON
```

Writes travel a short, direct path into storage through one seam. Reads are served
**exclusively** through a standards-based query layer, and there is no bespoke read
endpoint anywhere alongside it. That is the constraint the whole harness exists to
test: not "can a standards-based interface serve reads", but "can it serve *all* of
them, with nothing kept back for the awkward case".

The interesting consequences are the awkward ones.

- The query layer holds **select permission and nothing more** on the observation
  store. It cannot write even by accident.
- The read path exposes **no arrival time and no insertion time** — only simulation
  time. A consumer able to filter on when a row was written could reconstruct the
  order the harness happened to write it in, which is not a fact about the
  simulated world.
- Internal consumers do **not** go out through the query layer and back. The
  planner reads the published uncertainty field directly through a port, because
  routing an internal consumer through the external read path would claim a seam
  that is not there.
- The query layer has no notification mechanism, which is precisely why the control
  namespace exists. Freshness is announced on the write side; the read side answers
  questions and volunteers nothing.

## Core versus plumbing

Inside the boundary sits only the genuinely bespoke logic:

- residual and divergence rules
- scheduling policy
- [sound speed](../../glossary.md#sound-speed) computation
- quality flagging
- the uncertainty and planning mathematics — see the
  [algorithm derivations](../../algorithms/index.md)
- the data dictionary made executable

Everything else — broker, query layer, reverse proxy, stores — is well-chosen
plumbing. The distinction matters because it is the honest answer to "what did you
build?": six kinds of decision logic and a lot of configuration around them.

## The port accounting

Ports-and-adapters is the governing discipline here, but it appears as annotation
on the flow above rather than as the primary picture — and it is claimed only where
it is real.

This is the requirements document's own accounting, reproduced without rounding:

| Boundary | Genuine port? | Rationale |
|---|---|---|
| Model kernel | **Yes** | The numerics will certainly be replaced. Interface: initialisation state in, gridded field out. |
| Coverage output | **Yes** | NetCDF today, Zarr plausibly later. |
| Event publication | **Marginal** | The broker could change; unlikely to. |
| Observation store | **No** | Postgres is not being swapped. |
| Observation intake | **No** | Aspirational rather than real. |

Three of the five entries are the interesting ones, and they are the three that a
system of this shape normally over-claims.

**The model kernel is a genuine port and can be shown to be one.** What makes it
genuine is not that an interface was declared; it is that more than one
implementation exists and is used. The analytic kernel
[advects and adds noise](../../algorithms/advection.md); the persistence kernel holds
the state still, which is simultaneously a second implementation and the reference
a forecast has to beat. A test double satisfies the same protocol without either
of them knowing. The contract is deliberately narrow — a state and a random
generator in, two arrays out — and a kernel cannot read configuration, publish,
write files, or know what an ensemble is.

**Event publication is marginal, and is wrapped thinly and documented as
marginal.** It is not dressed up. Substituting the broker is conceivable and is
not planned, and the wrapper is thin enough to be honest about that.

**The observation store and observation intake are not ports and are not dressed
as ports.** Postgres is not being swapped, and an intake abstraction here would be
aspiration rather than design. This is the row that matters most on this table,
because it is the one a diagram would silently upgrade: draw a box around a
database and an arrow into it, and a reader infers a seam that nobody intends to
use. There is no such seam. The store is named, and its schema is part of the
system.

### Two more, from the constitution

The requirements document's table lists five boundaries. The project's constitution
counts **four** genuine ports, and its list is the two "Yes" rows above plus two
the table does not consider at all:

- **The clock.** No component calls a wall-clock function for any operational
  purpose; all time comes from the simulation clock service through a port, which
  is what makes accelerated replay possible.
- **The random-number generator.** All stochastic behaviour derives from explicitly
  seeded generators reached through a port, which is what makes a run reproducible
  from its manifest.

These are not a disagreement between the two documents so much as a difference in
what each was enumerating: the requirements table is an audit of the *architectural*
boundaries a reader might otherwise assume were pluggable, and the constitution is
a list of the interfaces every component must go through. Both are stated here
rather than merged, because merging them would produce a count — "four ports" or
"two ports" — that is wrong under one reading or the other.

### The boundaries that look like ports and are not

Worth naming explicitly, because each is a place where an architecture diagram
would happily draw a socket:

| Looks like a seam | What it actually is |
|---|---|
| The observation store | A named Postgres schema. Not swappable, not abstracted. |
| Observation intake | One ingest client with one seam into one store. |
| The query layer | pygeoapi with two provider plugins written for this harness. Standards-based, but not a slot another implementation drops into. |
| The reverse proxy | nginx with a path policy. Configuration, not an interface. |
| The broker | Marginal at best; see the table above. |
| The browser client | A consumer of the read path. Nothing is pluggable behind it. |

The harness claims exactly the pluggability it has, and neither its code nor its
documentation claims more. A demonstration system that overstated its seams would
be worth less as evidence than one that states a small number of them accurately —
which is the same argument the [SensorThings primer](../../standards/sensorthings.md)
makes about conformance, for the same reason.

## Where to go next

- The [subsystem reference](../subsystems/index.md) — all eighteen components, one
  page each, with the failure mode each one owns.
- The [algorithm derivations](../../algorithms/index.md) — the arithmetic inside the
  ACT and the planning stages.
- The [standards primers](../../standards/index.md) — what the read path speaks.
- The [glossary](../../glossary.md) — the vocabulary, none of it assumed.
