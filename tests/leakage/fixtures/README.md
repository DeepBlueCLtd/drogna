# The leakage corpus

Eight directories. **Six of them are deliberately leaky controls**, and they are the
reason the other two are worth running: a scanner reporting nothing is indistinguishable
from a scanner that is no longer running, and the only way to tell them apart is to keep
something in front of it that it is supposed to object to.

Everything here is written by `make_fixtures.py`, which is committed beside them. It is a
pure function of the root seed at the top of that file — `20260826` — and it writes NetCDF
classic through `harness_core.netcdf`, which is the one encoder in the repository and the
reason two runs produce byte-identical files. Regenerate with:

```bash
uv run python tests/leakage/fixtures/make_fixtures.py
```

No test imports that script at run time. The tests read the committed bytes, so a failure
is reproducible from the repository alone with no deployment and no network (FR-018).

The numerics are fake and the domain is invented: a third of a degree of nowhere, at a
latitude chosen so that the two-kilometre identification radius is a couple of grid cells
across. Nothing here is data about anywhere (Constitution V).

## Why the READMEs are not inside the bundles

A bundle is scanned member by member, and a `README.md` inside one would be scanned as an
embedded text member — correctly, because a text file that travels with a release is
exactly where a hostname or a command line ends up. Saying "this fixture is deliberately
leaky" inside the fixture would therefore make every clean bundle report a hit for its own
documentation. So the documentation is here, one level up, outside every bundle.

## The bundles

| Directory | What it is |
|---|---|
| `clean_bundle/` | What a release should look like: one field, its coordinates, and nothing else. Must report **zero hits**. |
| `leaky_bundle/` | **Deliberate control.** Four separate leaks, one per rule that could plausibly stop working. |
| `unreadable_bundle/` | **Deliberate control.** A `.tiff` member the scan does not understand. An unrecognised member is a failure, not a skip. |
| `manifest_bundle/` | **Deliberate control.** The run manifest itself, inside the bundle. It holds the root seed, the clock configuration and every participant's config digest — it is the document the release is withholding. |

`leaky_bundle/` carries, deliberately:

- a `history` global attribute holding a command line and the input paths that produced it;
- a `nearest_station` global attribute holding a coordinate pair sitting on a measurement;
- a variable `comment` naming a sensor and a datastream identifier;
- a `notes.txt` member naming a host and a home directory.

## The pairs

Each pair is `t0/` and `t1/` — two successive released products for the same collection on
the same grid — plus `run-manifest.json`, the run manifest carrying the measurement geometry
for the interval between them.

| Directory | What it is |
|---|---|
| `mitigated_pair/` | The mitigation: a whole-domain rewrite. Its recovery statistic must be **at or below the chance bound**. |
| `unmitigated_pair/` | **Deliberate control.** The same run with the whole-domain rewrite disabled, so only the neighbourhood of recent measurements was refreshed. Must be **at or above the discovery bound**, or the gate has lost its power. |
| `age_driven_pair/` | **Deliberate control.** The mitigation applied properly *and* an observation-age field released beside it. The union of the two masks scores below the chance bound; the age field on its own scores 1.0. This is why every variable is scored and not only the union. |
| `unchanged_pair/` | **Deliberate control.** Two products differing by less than the quantisation step. The mask is empty, and an empty mask is **inconclusive, not a pass**. |

The mitigated pair's mask covers about two cells in three, scattered across the whole
domain. That matters: a mask covering nothing, or covering everything, scores at chance for
reasons that have nothing to do with the mitigation working, and
`test_the_mitigated_mask_could_have_recovered_something` is what stops the pass becoming
vacuous.

## Where the measurement geometry lives

In the run manifest, which is where FR-015 always said it was. It was not there for a while
and this README used to explain why not: `contracts/schemas/run-manifest.schema.json` was
closed and carried the root seed, the seed derivation rule, the clock configuration, the
participants and their config digests, and no geometry, so each pair carried a standalone
`geometry.json` in the shape the offload path would have to emit. The specification was
right and the schema was incomplete. The schema now carries an optional
`measurement_geometry` block and the standalone document is gone.

```json
{
  "schema_version": 1,
  "run_id": "leakage-fixture",
  "root_seed": 20260826,
  "measurement_geometry": {
    "identification_radius_m": 2000.0,
    "interval_seconds": 3600,
    "measurements": [{ "longitude": -7.95, "latitude": 55.05, "simulation_seconds": 0 }]
  }
}
```

**Optional, for a reason that shows up in this directory.** Two components write a manifest.
C-01 writes the run's own manifest as the run starts and holds no observations, so what it
writes carries no geometry — that is `manifest_bundle/run-manifest.json`, and it is a
complete manifest. The offload packager writes the copy that travels beside a bundle and does
know where the measurements were taken, so that copy carries the block — that is what every
pair here holds. Nothing writes the second form yet; producing it is recorded as a task
against feature 014.

**And never inside a released bundle.** A manifest carrying the geometry is the document that
says where the measurements were taken, which is exactly what the release is withholding.
`manifest_bundle/` is the control that says so, and `scripts/check_leakage.py` takes the
manifest for a candidate bundle with `--manifest`, from outside it, rather than looking for
one inside — requiring one inside would mean committing the leak in order to scan for it.

`tests/leakage/updated_region.py:load_geometry` reads the block through the model generated
from the master and refuses loudly rather than defaulting: an unreadable file, a document that
is not JSON, a manifest that is not a manifest, an absent block, an empty `measurements`, a
measurement missing a coordinate and a coordinate of the wrong type are seven different faults
and are reported as seven different sentences, each naming the file and the field. None of them
returns an empty geometry. A geometry that silently came out empty would make every comparison
inconclusive, and an inconclusive run nobody looked at is how a gate stops working.

The measurements span about nineteen kilometres against a two-kilometre identification
radius. That is deliberate: a platform that did not move cannot be recovered by any mask,
so a low statistic against a stationary run says nothing about the mitigation and is
reported as inconclusive rather than as a pass (FR-017).
