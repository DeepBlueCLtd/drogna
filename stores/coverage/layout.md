# The coverage store: naming, cataloguing and publication

**Status: normative.** C-08 is a filesystem layout and a set of rules, not a process. This
document is the contract between the publisher, which writes runs into the store, and the
query layer, which serves them. Neither writes the other's code, and neither needs a
conversation with the other's author to get this right.

The property the layout exists to deliver is SRD FR-21: **a new model run becomes servable
without editing collection configuration.** If serving a run required a configuration edit,
the sense → decide → act → publish cycle would have a human in the middle of it, and the
harness would be demonstrating something other than what it claims.

## The tree

```text
<root>/
├── current                       the pointer: one run identifier, one line
├── staging/                      runs being assembled; never catalogued, never served
│   └── run-000002-3c5d9275107d/
└── runs/
    ├── run-000000-7f80b47c7b91/
    │   ├── forecast.nc           the forecast field, CF-conventions NetCDF
    │   ├── uncertainty.nc        the uncertainty field, same grid
    │   └── run-manifest.json     what produced this run, and what it is valid for
    └── run-000001-6ab42ca09e7d/
        └── ...
```

Those three names — and nothing else — are what the root holds.
`stores/coverage/validate_layout.py` reports anything else at the root as a fault, because a
stray file there is either a half-finished operation nobody cleaned up or a second writer
nobody knew about.

Every name in that tree except the run identifiers is a configuration value, under
`query.coverage_store` in `config/<destination>/query.json`. The names above are the values
both destinations carry, and the destination parity check is what keeps them the same. They
are configuration rather than constants because Constitution IV admits no filename in
component source; they are nevertheless a convention, and a destination that changed them
would no longer be running the same system.

`<root>` is `query.coverage_store.root`. The query layer mounts it read-only.

## Why staging is inside the store

The model runner writes a run into `staging/` and the publisher makes it visible by renaming
it into `runs/`. A rename is indivisible only within one filesystem: between two volumes it
is a copy, which is not, and the publisher refuses it rather than performing it
non-atomically. So `staging/` is a directory of this store and shares its volume. It is not
tidier to give it a volume of its own — it is a deployment in which nothing can ever be
published, and the failure appears only when a run is first published rather than when the
deployment starts.

The consequence for the deployment is that the coverage volume is mounted **writable** in
the model runner and the publisher, and read-only everywhere else: the query layer, the
monitor, the planner and telemetry all read published fields and write nothing.
`deploy/lib/mount_lint.py` is the gate that keeps every directory named here under a path
the deployment actually mounts.

## Run identifiers

A run identifier is a pure function of the root seed and the run sequence:

```text
run_id = "<prefix>-<sequence padded to six digits>-<first twelve hex digits of
           sha256("<rule>|<version>|<root_seed>|<sequence>")>"
```

with `rule`, `version` and `prefix` from `query.coverage_store.run_id`. Nothing else enters
it — no clock, no entropy, no ordering the filesystem happened to hand back. Replaying a
scenario from its seed therefore produces the same identifiers, which is what lets two
replays be compared response for response (Constitution II, FR-013).

The single implementation is `derive_run_id` in `query/plugins/coverage_catalogue.py`. The
publisher is expected to compute the same string rather than to import it, which is why the
rule is written out here: the two agree because they compute the same function of the same
five values, not because they share a module.

Worked examples, at rule `drogna-coverage-run-id`, version `1`, prefix `run`, and the root
seed both destinations carry (`20260826`):

| sequence | run identifier |
|---|---|
| 0 | `run-000000-7f80b47c7b91` |
| 1 | `run-000001-6ab42ca09e7d` |
| 2 | `run-000002-3c5d9275107d` |
| 17 | `run-000017-3c1aead663b1` |

The sequence is padded so that a directory listing sorts in run order, and the digest is
present so that two scenarios with different seeds cannot collide on a name.

## What makes a run complete

A run is catalogued when its directory holds **all three** of:

- the forecast field, `forecast_file`;
- the uncertainty field, `uncertainty_file`;
- the run manifest, `manifest_file`, which validates against the rules below.

A directory holding a forecast field and no uncertainty field is incomplete and is not
served. So is one whose manifest is unreadable, is not JSON, or names a run identifier other
than the directory it is in. The catalogue reports the reason for each rather than leaving
an operator to guess why their run is invisible.

Anything whose name ends in `partial_suffix` is invisible to the catalogue entirely. That is
what a publisher writes under.

## The run manifest

Its purpose is that a served value can be traced back to what produced it. Required keys:

| key | meaning |
|---|---|
| `schema_version` | Bumped when the shape changes in a way a reader must notice. |
| `run_id` | This run's identifier. Must equal the directory name. |
| `root_seed` | The seed the run derives from. |
| `run_sequence` | Which run of this scenario this is. With `root_seed`, it determines `run_id`. |
| `generator_version` | The environment generator that produced the initial state. |
| `model_version` | The model kernel that produced the forecast. |
| `sim_time` | The simulation time the run was made at. Simulation time, never host time. |
| `valid_time` | `{begin, end}`: the extent the forecast is valid over. |
| `ensemble` | `{members, method}`: how many members, and how they were combined. |

`stores/coverage/run-manifest.example.json` is a worked example, and a test validates it
against these rules so it cannot drift from them.

`valid_time` is load-bearing beyond documentation. An EDR query that names no time is
answered over this extent, taken from this document. It is not answered as "now": there is
no now here, and reading a host clock to decide what a forecast says would be Constitution I
broken at the one place where the answer would still look right.

The shape belongs in `contracts/schemas/coverage-run-manifest.schema.json` as a generated-
types master, by Constitution III. It is not there yet; the rules are enforced by
`validate_manifest` in `query/plugins/coverage_catalogue.py` and stated here in the
meantime.

## The current pointer

`current` is a text file at the root holding **one run identifier on one line**. That run is
what the forecast collection serves.

- Exactly one line: resolved.
- No file, or an empty one: no run is current, and the collection says so rather than
  choosing the newest, which would be a guess wearing the appearance of a fact.
- More than one line: **two runs claim to be current**. The catalogue refuses to resolve and
  reports both identifiers. Serving an arbitrary one of them would be worse than serving
  nothing, because nothing in the response would say which was chosen.

A superseded run stays in the store and stays addressable by its own identifier, as an EDR
instance of the same collection. Comparing two runs is the point of keeping them (FR-015).

## What the publisher must do

This is the whole contract. Nothing else about the publisher's internals matters here.

1. Compute `run_id` from the root seed and the run sequence, by the rule above.
2. Write the run into `runs/<run_id><partial_suffix>/` — the forecast field, the uncertainty
   field, and the manifest last. Flush and `fsync` each file before renaming.
3. `os.rename` the directory to `runs/<run_id>/`. A rename within a filesystem is atomic, so
   no reader ever sees a half-written run: before it, the directory is invisible to the
   catalogue because of its suffix; after it, the run is complete.
4. Write the new pointer to `current<partial_suffix>` and `os.replace` it onto `current`.
   One operation, so no reader sees an empty or a doubled pointer.
5. Announce the run on `ctl/run-published`. The query layer has no notification mechanism
   and is not polled for freshness; that message is how a consumer learns (FR-022).

Steps 3 and 4 are separate operations, and the window between them is the one state a reader
can catch: the new run is present and catalogued, and `current` still names the old one.
That is a safe window — both runs are complete, and both are addressable by identifier — and
it is the reason `current` is replaced rather than the run directory carrying its own claim
to be current. A claim inside each run directory would make the same window a period in
which two runs both claimed it, which is precisely the conflict the pointer exists to make
impossible in ordinary operation and detectable when it happens anyway.

## What the query layer must not do

- Not enumerate runs in configuration. The run set is read from this tree, at request time
  (FR-017).
- Not refresh its catalogue on a timer. The cache is keyed on the store's own state — the
  run directory names, the pointer's content, and the size and inode of each file. The store
  changes when the publisher renames a directory, not when an interval elapses, and an
  interval would be a host clock deciding what to serve.
- Not write. The mount is read-only and the layout gives it nothing to write.

## Checking a store

`stores/coverage/validate_layout.py` checks a store against everything above and reports
every fault rather than the first:

```sh
python stores/coverage/validate_layout.py --config config/local/query.json --root <path>
```

It calls the same catalogue the query layer serves from, so a store it passes is a store the
query layer can read, and there is no second implementation of these rules to disagree with
the first.
