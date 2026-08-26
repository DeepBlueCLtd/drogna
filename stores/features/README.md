# The feature store (C-07)

Static spatial reference — synthetic bathymetry and a synthetic coastline — in the
`features` schema of the same Postgres instance that carries `observations` (SRD FR-12).
Two schemas, one instance: the split is conceptual, and doubling the operational surface
would buy nothing.

**The content is synthetic and represents no real place.** It is a smooth slope with seeded
roughness and a wandering line, produced from the run's root seed by
`stores/features/provision.py`. The harness's numerics are deliberately fake (SRD §1.1) and
this is no exception: it is a boundary to draw against and a depth to plan around, not a
survey of anywhere.

It is the harness analogue of pre-sail loading. What is aboard is what was loaded before
the scenario started, and nothing loads anything during one.

---

## Provisioning

Three steps, all from the one script, none of which opens a database connection of its own:

```sh
HARNESS_CONFIG=config/local/features.json
python stores/features/provision.py --emit schema   | psql "$DSN"   # tables and grants
python stores/features/provision.py --emit content  | psql "$DSN"   # this seed's content
python stores/features/provision.py --emit digests  > "$DROGNA_ARTEFACT_DIR/features.json"
```

The script reads one environment variable, `HARNESS_CONFIG`, and validates that file against
its packaged schema before doing anything else, exactly as a component does. It writes SQL
to standard output because the seeding path already knows how to reach the database; a
second connection string here would be a second place holding one.

Re-running converges rather than loading twice. The content statements empty the tables and
reload them, in one transaction, so an interrupted run and a completed one end in the same
place.

### The digests

Every row is a function of the root seed and the configuration, so the same seed provisioned
twice produces byte-identical content. The digest report is what the seeding record keeps,
and the same digests are written into `features.provisioning` — so the store's own claim
about what it holds and the seeding record's claim are the same claim, and a difference
between two instances is a difference somebody made.

---

## Read-only during a run

`roles.sql` grants `SELECT` on both tables to every run-time role and nothing else, then
asserts the result. A provisioning run fails if a grant has drifted, rather than leaving it
to be discovered by a component that wrote something it should not have been able to
(FR-13, SC-010).

The provisioning role is the only one that may write, and it writes before the scenario
starts. `tests/integration/test_feature_store_readonly.py` attempts an insert, an update and
a delete as each run-time role against a real database, and asserts each is refused.

---

## The tables

| Table | What it holds |
|---|---|
| `bathymetry` | A grid of depths: latitude, longitude, depth in metres, and a PostGIS point. |
| `coastline` | One line along the shallow edge of the domain, as a PostGIS line string. |
| `provisioning` | What was loaded, and the digest of its content. |

Both have GiST indexes on their geometry, which is what the query layer and the client will
want when they draw against them.

There is no time column anywhere in this schema, and no column takes a default. The content
is static for the whole of a run, so there is nothing here for a host clock to fill
(Constitution I).

## What is not here

The bathymetry is not consulted by the write path. The sensors sample the environment
generator's field, not this schema, and the ingest client never reads it. It exists for the
planner and the client, which is why this half of FR-12 is last in the feature and why
nothing upstream waits on it.
