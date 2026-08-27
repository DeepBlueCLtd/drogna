---
title: CF conventions
---

# CF conventions

The Climate and Forecast conventions are a set of rules for what goes inside a NetCDF file
so that a reader who did not write it can understand it. NetCDF gives you arrays with names
and attributes; CF tells you which attributes to write, and what they must mean, so that
the file describes itself.

A file whose meaning depends on documentation held somewhere else is a file that will
eventually be misread — because the documentation is on a wiki that moved, or because the
person who reads the file in three years is not the person the documentation was written
for. CF is the mechanism by which units, coordinate definitions and variable meanings
travel with the data.

drogna stores its forecast and uncertainty fields as CF-conforming NetCDF, and the
[offload packager](../subsystems/c17-offload-packager.md) exports a run's
[profiles](../glossary.md#profile) the same way. This page is about the export, because
the export is the file that leaves.

## Standard names are a controlled vocabulary

`units` says a number is in degrees Celsius. `standard_name` says *what* is in degrees
Celsius, drawn from a published table rather than invented at the keyboard. That is the
difference between a file a program can interpret and a file a person has to.

The export carries three quantities and every one of them has a standard name:

| variable | `standard_name` | `units` |
|---|---|---|
| `sea_water_temperature` | `sea_water_temperature` | `degree_Celsius` |
| `sea_water_practical_salinity` | `sea_water_practical_salinity` | `1` |
| `sea_water_pressure` | `sea_water_pressure` | `dbar` |

Practical salinity's unit is `1` because it is a ratio and has no dimension. Writing `psu`
there is common and wrong, and it is the sort of wrong that a reader silently accepts.

[Sound speed](../glossary.md#sound-speed) is **not** exported and is not one of the three.
It is derived at the point of
use from temperature, salinity and depth by the single implementation in `harness_core`
(ADR-0005). A derived value shipped
beside its inputs is a second source of truth that can disagree with them after a change to
the equation, and nothing in the file would say which was right.

## Why `trajectoryProfile` is the geometry that fits

Most of CF assumes a grid. The
[discrete sampling geometries](../glossary.md#discrete-sampling-geometry) are the part of
CF for data that is not one: a single point, a time series at a fixed point, a vertical
profile, a path of points, and the combinations of those.

What the packager has is a series of vertical profiles taken at successive positions along
a sampling path. That is `trajectoryProfile` exactly: a
[trajectory](../glossary.md#trajectory) of profiles. Choosing
`profile` alone would throw away the ordering, which is the only thing that makes the
profiles a path rather than a bag of positions. Choosing a gridded representation would
claim a regularity the sampling does not have.

**The trajectory in the file is an ordering of measurements and nothing else.** It carries
no identity between profiles, no heading, no speed and no platform. drogna's data model
admits no tracked entity of any kind, and the word "trajectory" here is CF's term for the
shape of the array, not a claim about anything moving through the water. That is worth
saying plainly, because "trajectory" is a word a reader can arrive at with the wrong
expectation.

## Ragged, not rectangular

Profiles differ in length: bathymetry truncates the deeper ones, so a five-level profile
and a one-level profile sit side by side in the same bundle.

A rectangular `profile × level` array would need a fill value everywhere the seabed came
first. A fill value is a number. A reader who misses the `_FillValue` attribute reads it as
a measurement, and the reading looks entirely plausible — a temperature of −999 is obvious,
but a temperature of 0.0 in a padded row is not.

So the export uses CF's **contiguous ragged array representation**. Every level is stored
once, end to end, along a single sample dimension `obs`, and a `row_size` variable gives
the number of levels in each profile. A reader walks the rows by taking `row_size[0]`
values, then the next `row_size[1]`, and so on. Nothing is padded because there is nothing
to pad, and the sum of the row sizes equals the length of `obs` — which is the property
that makes the representation readable at all, and which the conformance check asserts.

## The vertical axis says which way is down

`depth` carries `positive = "down"`.

Without it a reader has to guess the direction of the vertical axis. Half of them will
guess the other way, and the plot they produce will look like a perfectly reasonable
profile that happens to be upside down. Nothing about the numbers gives it away. The
attribute costs eleven characters and removes the whole class of error.

## Time is referenced to the simulation epoch

A CF time coordinate is a number plus a units string giving the reference instant — so the
epoch is *data*, not convention. That makes the units string the one place a host clock can
reach the numbers in a file while looking like metadata.

drogna's exports are referenced to the run's simulation epoch, taken from the run manifest:

```text
time:units = "seconds since 2026-09-01T00:00:00.000000Z"
```

Every value on the axis is an offset in simulation seconds from that instant. No host clock
value appears anywhere in an exported file, which is Constitution I applied at the one place
it is easiest to break by accident.

## What the export emits

Dimensions: `trajectory`, `profile`, `obs`.

| variable | dimension | what it is |
|---|---|---|
| `trajectory` | `trajectory` | instance variable, `cf_role = "trajectory_id"` |
| `profile` | `profile` | instance variable, `cf_role = "profile_id"` |
| `trajectory_index` | `profile` | which path each profile belongs to; `instance_dimension` |
| `row_size` | `profile` | levels in each profile; `sample_dimension = "obs"` |
| `time` | `profile` | simulation seconds since the epoch; `axis = "T"` |
| `latitude` | `profile` | degrees north, WGS 84; `axis = "Y"` |
| `longitude` | `profile` | degrees east, WGS 84; `axis = "X"` |
| `depth` | `obs` | metres below the surface; `axis = "Z"`, `positive = "down"` |
| the three data variables | `obs` | with `standard_name`, `units` and `coordinates` |

Global attributes: `Conventions`, `featureType`, `title`, `summary`, `format_version`,
`bundle_id`, `run_reference`, `time_coverage_start`, `time_coverage_end`.

The per-variable attributes are these nine and no others. `standard_name` and `units` say
what a number is and what it is in; `long_name` says it in words where CF has no standard
name for the quantity; `axis` marks a coordinate as one of the four axes; `positive` gives
the vertical axis its direction; `cf_role` marks an instance variable as the identifier of
a trajectory or a profile; `coordinates` attaches a data variable to the coordinates that
locate it; `sample_dimension` tells a reader which dimension `row_size` counts along; and
`instance_dimension` tells it which dimension `trajectory_index` indexes into.

`run_reference` is an opaque derivation of the run manifest's digest. It is enough to tie
two bundles to one run for somebody who holds the manifest, and useless to somebody who
does not.

That list is the whole of it. The attribute allow-list in the packager's configuration
holds exactly these names plus the per-variable ones above, and it is applied at write time
— so an attribute not on the list cannot be written and then removed later, because there
is no later.

## What the export deliberately does not emit

CF suggests four global attributes that a well-behaved producer might write. The export
writes none of them, and this is the section that says so rather than leaving the absence
to be read as an oversight.

| attribute | why not |
|---|---|
| `history` | CF's own suggestion is a line per processing step naming the command that ran. That is a command line, a program path and usually an input path — three of the things SRD FR-42 names, in one attribute. It also carries the host time at which the file was written, in a file produced by a component forbidden to read a host clock. |
| `source` | The method of production: in practice the name of the model, the machine or the instrument. The instrument is a sensor identifier by another name. |
| `comment` | Free text with no defined content, which is the shape of every accidental disclosure. There is nothing an export needs to say here that it cannot say in a field with a meaning. |
| `institution` | Where the data was produced — an organisation, and by implication a deployment and the people in it. |

SRD FR-42 names provenance metadata in exported files as an explicit leakage path. This is
the producer side of that: the file is safe to hand on because of what was never written,
not because of what was stripped afterwards. A stripping pass is a pass that has a day it
does not run.

Nothing about the instrument survives into the export either. A recorded observation
carries a thing, a sensor, a datastream and a feature of interest; the packager reads the
position, the depth, the instant and the value, and the other four never enter its model of
a profile. What cannot be reached cannot leak.

## A worked example

This opens a produced bundle and prints one profile. It is run in CI against a bundle the
packager wrote, so the primer cannot drift from the file.

```python
from harness_core.netcdf import read_netcdf


def first_profile(payload: bytes) -> list[str]:
    """Read the first profile out of a bundle and render it as depth against temperature."""
    document = read_netcdf(payload)
    rows = [round(value) for value in document.variables["row_size"].values]
    depths = document.variables["depth"].values
    temperatures = document.variables["sea_water_temperature"].values
    units = document.variables["time"].attributes["units"]

    lines = [f"time axis: {units}", "depth_m  temperature_degC"]
    for level in range(rows[0]):
        lines.append(f"{depths[level]:7.1f}  {temperatures[level]:17.3f}")
    return lines
```

Reading the row sizes first is the whole of the ragged representation in three lines: the
first profile is the first `row_size[0]` values of every variable on `obs`, the second is
the next `row_size[1]`, and no index arithmetic beyond that is needed.

The reader used here is drogna's own, because drogna writes the classic NetCDF format
directly rather than through a NetCDF library — the file must be byte-identical between two
runs of a scenario, and the usual writers stamp a creation time and a library version into
every file they produce. Any CF-aware tool reads the same bytes; `xarray.open_dataset` over
this file gives the same three columns.

## The question drogna needs it to answer

Whether an exported file can be handed to someone with no knowledge of the system that
produced it and be read correctly, using ordinary tools, with no accompanying explanation.
That is the only test of self-description that means anything — and the corollary is that
the file must also say nothing about the system that produced it, which is the other half
of this page.
