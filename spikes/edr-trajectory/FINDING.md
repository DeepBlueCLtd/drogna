# Finding: the M ordinate survives WKT parsing at the pin, and is lost silently below it

**Run date**: 26 August 2026
**Spike**: `002-edr-trajectory-spike` (SRD v0.3 FR-20, FR-50, FR-51; ADR-0003)
**Reproduction**: `./run.sh` in this directory. Evidence in `results/`.

---

## The result, in one sentence

**Yes**: with Shapely 2.1.2 built against GEOS 3.13.1, every per-vertex M ordinate of an
EDR trajectory `coords` string survives `shapely.wkt.loads` exactly and in order, reaches
a provider untouched, and supports a CoverageJSON Trajectory response whose values match
the coverage at each vertex's own arrival time to 2.7 × 10⁻⁸ °C — while the published
pygeoapi image, which ships Shapely 2.0.3, loses those times without raising anything.

### Provenance

| | |
|---|---|
| pygeoapi | `0.25.dev0` |
| Base image | `geopython/pygeoapi@sha256:03305eb4f958c6a3c0cbeb89ae5a1010184050d990c61f6cf7e9ed7c0cbb3269` (`:latest`, built 18 August 2026) |
| At the pin | Shapely 2.1.2, GEOS 3.13.1 (`Dockerfile.pinned`) |
| Below the pin (as shipped) | Shapely 2.0.3, GEOS 3.12.1 (the base image untouched) |
| Below the pin (older GEOS) | Shapely 2.0.7, GEOS 3.11.4 (`Dockerfile.belowpin`) |
| Provider class | `provider_stub.SpikeTrajectoryEDRProvider`, subclassing `pygeoapi.provider.xarray_edr.XarrayEDRProvider` |
| Fixture seed | `20260826`; 342,037 bytes; CF-1.8 NetCDF; `drogna_synthetic = "true"` |
| Tolerance | 1 × 10⁻⁶ °C |

---

## The question

SRD FR-20 requires EDR trajectory queries with per-vertex timestamps: the response
reports conditions forecast for the moment of arrival at each point, not conditions at
query time. SRD v0.3 settled that no supplied pygeoapi provider implements trajectory at
all, so drogna builds one (FR-50), and narrowed the remaining unknown to one thing: does
the M ordinate that carries the vertex time survive the framework's WKT parsing and reach
that provider (FR-51)?

## The method

1. Parse a `LINESTRING ZM` and a `LINESTRING M` whose vertices carry distinct, increasing
   M values, at three Shapely and GEOS combinations, and read the M ordinates back.
2. Register a throwaway EDR provider with a pygeoapi instance and have it write down
   exactly what it was handed before computing anything.
3. Sample one four-dimensional route of twenty vertices against a small synthetic
   coverage whose analytic form is known, and score the returned values against three
   expectations: each vertex at its own time, every vertex at the query time, and every
   vertex snapped to the nearest coverage time step.

The fixture is built so that those answers cannot be confused. Its field is multilinear
by construction, so quadrilinear interpolation reproduces it exactly and the expectation
is closed-form rather than sampled; `selfcheck.py` proves both that and the separation
before any query is issued.

```text
max_abs_error of the written fixture against its analytic form : 0.0 °C
max_abs_error of interpolation at the route's off-grid vertices : 3.6e-15 °C
smallest gap between the per-vertex and query-time expectations : 0.497 °C
  ... which is 497,384 times the tolerance (ten was required)
```
— `results/selfcheck.txt`

---

## Evidence

### 1. M survives at the pin

```text
EDR trajectory M-ordinate probe
  shapely 2.1.2  GEOS 3.13.1  meets FR-51 pin: YES

  LINESTRING ZM
    exception raised   : False
    has_z / has_m      : True / True
    M expected         : [1788220800.0, 1788226668.0, 1788232536.0, 1788238404.0]
    M recovered        : [1788220800.0, 1788226668.0, 1788232536.0, 1788238404.0]
    M matches input    : True
    Z recovered        : [-5.0, -100.0, -220.0, -380.0]
    WKT round trip     : LINESTRING ZM (-3.6 48.4 -5 1788220800, ...)

FR-51 assertion PASSED: every per-vertex M ordinate survived parsing.
```
— `results/version-probe-at-pin.txt`

### 2. Below the pin it is lost, and nothing raises

The published pygeoapi image, unmodified:

```text
  shapely 2.0.3  GEOS 3.12.1  meets FR-51 pin: NO

  LINESTRING ZM
    exception raised   : False
    has_z / has_m      : True / has_m absent (shapely < 2.1)
    M recovered        : [None, None, None, None]
    Z recovered        : [-5.0, -100.0, -220.0, -380.0]
    WKT round trip     : LINESTRING Z (-3.6 48.4 -5, -2.55 49.45 -100, ...)
```
— `results/version-probe-below-pin-pygeoapi-image.txt`

An older GEOS is worse:

```text
  shapely 2.0.7  GEOS 3.11.4  meets FR-51 pin: NO

  LINESTRING M
    exception raised   : False
    has_z / has_m      : True / has_m absent (shapely < 2.1)
    M recovered        : [None, None, None, None]
    Z recovered        : [1788220800.0, 1788226668.0, 1788232536.0, 1788238404.0]
    WKT round trip     : LINESTRING Z (-3.6 48.4 1788220800, ...)
```
— `results/version-probe-below-pin-geos311.txt`

The timestamps arrive in the **Z** slot. A provider reading Z as elevation would take
1,788,220,800 for a depth in metres, and nothing anywhere would raise.

### 3. The geometry reaches the provider untouched

```json
{
  "shapely_version": "2.1.2",
  "geos_version": "3.13.1",
  "provider_class": "provider_stub.SpikeTrajectoryEDRProvider",
  "query_types_advertised": ["position", "cube", "trajectory"],
  "geom_type_received": "LineString",
  "vertex_count_received": 20,
  "all_vertices_identical": true
}
```
— `results/handoff-comparison.json`

Every one of the twenty vertices arrives with the longitude, latitude, Z and M that were
sent, at the six decimal places the request carried. SRD §5.3's claim that pygeoapi
"parses `coords` with `shapely.wkt.loads` and passes the geometry to the provider
untouched" is confirmed by observation, and by the source: `shapely_loads` at
`pygeoapi/api/environmental_data_retrieval.py:362`, handed on as `wkt=` in the
`query_args` dict at line 423 and dispatched by `BaseEDRProvider.query`.

### 4. One four-dimensional route, sampled and scored

```text
request : http://pygeoapi:80/collections/spike_coverage/trajectory
          ?coords=LINESTRING ZM (-3.600000 48.400000 -5.000000 1788226200, ... )
          &parameter-name=sea_water_temperature
          &datetime=2026-09-01T00:00:00Z&f=json
status  : 200
Content-Type: application/vnd.cov+json
domain type            : Trajectory
well-formed Trajectory : True

tolerance                 : 1e-06 degC
max error vs per-vertex   : 2.696e-08 degC     <- within tolerance
max error vs single-time  : 1.284e+01 degC     <- 12.8 million tolerances away
max error vs nearest step : 5.269e-01 degC     <- so it interpolated, it did not snap

  idx    returned   per-vertex  single-time  nearest-step
    0    10.10540    10.10540     10.60279      10.60279
    1     9.34781     9.34781     10.39618       9.39135
   ...
   19    -4.47729    -4.47729      8.35925      -4.68682
```
— `results/query.txt`, full response in `results/trajectory-at-pin.json`

The response is CoverageJSON of the Trajectory domain with one `(t, x, y, z)` tuple per
vertex on a `composite` axis, `referencing` entries for `GeographicCRS`, `VerticalCRS`
(depth, positive down) and `TemporalRS`, and an `NdArray` range of shape `[20]` over
`["composite"]`. The times returned match the times sent, vertex for vertex. It is the
shape the browser client needs for FR-47's four-dimensional route: a list of
`(t, x, y, z, value)` rows, in order, no reshaping required.

### 5. The same request below the pin

```json
{
  "code": "NoApplicableCode",
  "description": "no per-vertex M ordinate reached the provider (shapely 2.0.3 on GEOS
    3.12.1). Per-vertex arrival times are unavailable; refusing to answer at a single
    time. See SRD FR-51."
}
```
— `results/trajectory-below-pin.json`, HTTP 500

That refusal exists only because the throwaway provider was written to check. The default
outcome of losing M is not an error: it is a provider quietly evaluating the whole route
at one time and returning HTTP 200 with values that look entirely reasonable. **The real
provider must make the same check and refuse the same way.**

---

## Where the SRD and ADR-0003 need correcting

SRD FR-51 and ADR-0003 both say: "Below Shapely 2.1 / GEOS 3.12 the M ordinate is
returned as NaN." The pin is right and the reason for it is right. The mechanism is
stated too narrowly, and the case it names is not the one the deployment would actually
meet.

There are three failure modes, not one. **Two were measured here; the first was not** —
see the note below the table.

| Shapely | GEOS | What happens to M |
|---|---|---|
| ≥ 2.1 | < 3.12 | **Not measured — from the documentation.** `get_coordinates(..., include_m=True)` returns **NaN**. Shapely's own docstring: "With older GEOS versions, M dimension coordinates will be NaN." `shapely.has_m` carries `@requires_geos("3.12.0")` and *raises* `UnsupportedGEOSVersionError` rather than returning False. |
| 2.0.x | ≥ 3.12 | **Not NaN — absent.** There is no `include_m` parameter and no `has_m` attribute at all. `LINESTRING M` yields `(x, y)` coordinate tuples; `LINESTRING ZM` yields `(x, y, z)` and round-trips out as `LINESTRING Z`. This is the pygeoapi image as it ships today. |
| 2.0.x | < 3.12 | **Worse than either.** `LINESTRING M` comes back as a `LINESTRING Z` whose Z values are the timestamps, with `has_z` True. |

**Which rows this spike actually ran, added 27 August 2026.** Two images were built and
captured: the pygeoapi image as it ships (row two) and Shapely 2.0.7 on GEOS 3.11.4 (row
three). Both are in `results/`. The first row needs Shapely ≥ 2.1 on GEOS < 3.12, and no
such image was built — that row is Shapely's docstring, quoted above, not an observation.

It is stated here because it is the case FR-51 names and the table would be misleading
without it, but it is marked, because this repository's whole method is that a claim
presented as measured has been measured. Nothing rests on it: the decision to write a
bespoke provider follows from rows two and three, and the test the second row demands —
assert M is recovered *and* that Z is what it should be — is strictly stronger than
anything the first row would require. Building that image would close it.

Suggested wording, for whoever owns the SRD and ADR-0003: *"Below Shapely 2.1 built
against GEOS 3.12 the M ordinate is lost silently — returned as NaN, dropped entirely, or
misread as Z, depending on the combination."* The consequence FR-51 states is unchanged
and correct: per-vertex timestamps vanish before any provider code runs, FR-20 fails, and
nothing raises. I have not edited either document; this feature owns
`spikes/edr-trajectory/` only.

One further version-sensitivity, separate from M: the OGC API-EDR specification writes
the geometry type without a space, `LINESTRINGZM(...)`. GEOS accepts that spelling from
3.12 and rejects it before, with `ParseException: Unknown type: 'LINESTRINGZM'`. That
failure at least is loud. The spike emits `LINESTRING ZM (...)`, which every tested
version accepts.

---

## Secondary findings, each one a trap avoided

**Query types are registered by method name, from `cls.__dict__` alone.**
`BaseEDRProvider.__init_subclass__` builds `query_types` from the subclass's *own*
methods. A plugin that subclasses `XarrayEDRProvider` and adds only `trajectory`
advertises **only** `trajectory`: `position` and `cube` disappear from the collection's
data queries, silently. `provider_stub.py` redeclares both as one-line delegations, which
is why `results/collection-metadata-bespoke.json` advertises all three. There is no
registration decorator in this version; defining a method called `trajectory` is the
whole mechanism.

**A provider's error message does not reach the client unless passed as `user_msg`.**
`GenericError.message` is `self.user_msg if self.user_msg else self.default_msg`. A
diagnostic passed positionally to `ProviderQueryError` is swallowed and the client sees
`"query error (check logs)"`.

**`limit` is passed to trajectory queries, defaulting to 10.** A provider that honoured
it naively would truncate a twenty-vertex route to ten and return HTTP 200. The stub
ignores it. The real provider must decide deliberately what `limit` means for a
trajectory — it is a records limit, not a vertex limit.

**Parameter selection works, and invalid names are rejected before the provider.**
`parameter-name=sea_water_temperature` arrives as `select_properties`;
`parameter-name=not_a_parameter` is refused by the framework with HTTP 400
`InvalidParameterValue` (`results/trajectory-bad-parameter.json`).

**The vertical convention has to be reconciled, and it is invisible if you get it wrong.**
WKT Z is elevation, positive up; the coverage's axis is depth, positive down. The stub
applies `depth = -z`. Running the route ascending and descending returns different values
(`results/trajectory-descending.json`, `values_differ: true`) — which is the only reason a
sign error would be visible at all. A three-dimensional `LINESTRING M` with no Z is
accepted and the stub defaults depth to zero (`results/trajectory-linestring-m.json`); the
real provider must choose that default explicitly.

**Interpolation against snapping is the provider's choice, and AT-01's error depends on
it.** Vertex times were placed deliberately between the fixture's three-hourly steps. The
stub interpolates linearly in all four dimensions: 2.7 × 10⁻⁸ °C against the per-vertex
expectation, 0.53 °C against nearest-step. Snapping would have been indistinguishable
from outside and would have put half a degree of avoidable error into what AT-01 reports.
**Recommendation: interpolate in time, and say so in the collection metadata.**

**Out-of-domain behaviour is one word of code and invisible from outside.** The same
provider, configured two ways, over the same fixture:

| Probe | `out_of_domain: null` | `out_of_domain: extrapolate` |
|---|---|---|
| Outside the horizontal domain | `[null, null]` | `[10.285, 9.620]` |
| Below the deepest level | `[null, null]` | `[2.294, -0.187]` |
| Beyond the last time step | `[null, null]` | `[-10.799, -12.078]` |
| Above the surface | `[null, null]` | `[11.439, 9.991]` |

Both return HTTP 200. Nothing in the response says which was chosen.
**Recommendation: null outside the domain, never extrapolation.** A forecast horizon that
silently extends itself is the worst possible failure for AT-01, and for a client drawing
a route through a volume it does not cover. — `results/boundary-probes.json`

**Non-monotonic vertex times and repeated vertices pass straight through.** The framework
neither orders nor deduplicates; the provider sees exactly what was sent. Both returned
sensible per-vertex values here. The real provider should decide whether a route that
goes backwards in time is an error.

**A GET trajectory tops out at 91 vertices, and there is no POST form.** At six decimal
places, 91 vertices is a 4,081-byte URL and works; 92 is 4,125 bytes and returns
`Request Line is too large (5700 > 4094)` — gunicorn's `limit_request_line` default, not
anything about EDR. `POST` to the trajectory endpoint returns **405**. Raising the limit
is a gunicorn setting; the ceiling matters for FR-47, where a planned route could be long.
— `results/length-probe.json`

**`geopython/pygeoapi:latest` is a development build and is not deployable as it stands.**
It reports `0.25.dev0` and is missing `jsonschema`, so `import pygeoapi` fails outright
(the Flask app path still works). The deployment must pin a released tag by digest, and
whatever it pins must be re-checked against `version_probe.py`.

---

## What the build needs (handover to the query layer, FR-50)

**Base class**: `pygeoapi.provider.base_edr.BaseEDRProvider`. In practice, subclass
`pygeoapi.provider.xarray_edr.XarrayEDRProvider` to inherit the NetCDF opening, the
coverage-properties parsing and the `x_field` / `y_field` / `z_field` / `time_field`
handling, and add `trajectory` to it.

**Methods to implement**, and the signature the framework calls:

```python
class TrajectoryEDRProvider(XarrayEDRProvider):
    def position(self, **kwargs): ...  # redeclare, or it stops being advertised
    def cube(self, **kwargs): ...  # redeclare, or it stops being advertised

    def trajectory(self, **kwargs):
        """kwargs: query_type, wkt (a shapely LineString), datetime_,
        select_properties, z, bbox, limit, instance, format_, crs_transform_spec,
        within/within_units, corridor_*, location_id."""
```

`BaseEDRProvider.query` dispatches by `getattr(self, kwargs['query_type'])`. There is
nothing else to register.

**What `trajectory` must do:**

1. Read M with `shapely.get_coordinates(geometry, include_z=True, include_m=True)`, and
   **refuse** — do not fall back to a single time — if any M is NaN or missing.
2. Reconcile the vertical: `depth = -z` (WKT elevation to CF depth), with an explicit
   default when the geometry carries no Z.
3. Sample the coverage at each vertex's own `(t, x, y, z)`, interpolating linearly,
   returning null outside the domain.
4. Emit CoverageJSON with `domainType: "Trajectory"`, a `composite` axis of
   `["t", "x", "y", "z"]` tuples, `referencing` for the horizontal CRS, the vertical CRS
   and the temporal RS, and `NdArray` ranges over `["composite"]`. `get_parameters()` on
   the base class builds the `parameters` block from the provider's fields.
5. Raise `ProviderQueryError(msg, user_msg=msg)` — positional-only messages are swallowed.
6. Ignore `limit`, or define what it means, but do not let it truncate the route.

**Where it lives**: `query/`, per the repository layout (C-09 is pygeoapi configuration
plus plugins). Not in `libs/`, and not here — nothing under `spikes/` may be imported by
drogna.

**How a collection selects it**: by dotted path in the provider's `name`. `load_plugin`
splits on the last dot and imports the class, so no entry in pygeoapi's plugin registry is
needed — only that the module is importable, which means `PYTHONPATH` must reach `query/`
inside the container:

```yaml
providers:
  - type: edr
    name: drogna_query.trajectory_provider.TrajectoryEDRProvider
    data: /path/to/run.nc
    x_field: lon
    y_field: lat
    z_field: depth
    time_field: time
```

**What FR-21 requires of that configuration**: a new model run must become servable
without editing the collection. The `data` key above is a literal path, which is exactly
what FR-21 forbids in effect. `XarrayProvider` already accepts a glob (`'*' in self.data`
opens with `xarray.open_mfdataset`), so a naming convention plus a glob is the cheapest
route; a catalogue-driven provider that resolves the newest run at query time is the more
honest one. **This spike did not test either.** It is the first thing the query-layer
feature should establish, and the `instance` mechanism — pygeoapi's `instances()` and
`instance()` on `BaseEDRProvider`, which this spike did not implement — is probably where
"the newest run, or a named earlier one" belongs.

---

## What the deployment needs (FR-51)

The pin, with the comment that must travel with it:

```toml
# Below Shapely 2.1 built against GEOS 3.12 the M ordinate of an EDR trajectory's
# LINESTRINGZM is lost silently — returned as NaN, dropped entirely, or misread as Z,
# depending on the combination. Per-vertex arrival times vanish before any provider code
# runs, FR-20 fails, and nothing raises: the first symptom is wrong values in a
# trajectory response that looks structurally correct. Do not relax this without
# re-running the FR-51 test.
shapely = ">=2.1"
```

Verifying the GEOS half needs a runtime check, not a dependency constraint: `shapely`
wheels bundle GEOS, so the version is a property of the built artefact.
`version_probe.assert_m_survives_wkt_parsing()` checks both halves and then proves the
behaviour rather than trusting the numbers. Adopt it unchanged as the test FR-51 requires;
`pytest version_probe.py` already runs it via
`test_m_ordinate_survives_wkt_parsing`. Note that it must not be written in terms of
`shapely.has_m` alone: on Shapely ≥ 2.1 with GEOS < 3.12 that call raises rather than
returning False, so a naive test errors instead of failing informatively.

The published pygeoapi image does **not** satisfy the pin. `Dockerfile.pinned` here shows
the smallest fix — `pip install "shapely>=2.1,<3" "numpy<2"`, the numpy bound because
Shapely 2.1 pulls numpy 2 and the image's Debian-packaged pandas and xarray are built
against numpy 1. The deployment should either do the same on a released pygeoapi tag or
build from a base that already carries Shapely 2.1.

---

## Contingency, if M ever stops surviving

If a future version loses M even at the pin, the fallback is to parse `coords` from the
raw query string inside the plugin rather than take the framework's parsed geometry.
**The provider is not handed the raw string**: `query_args` carries only `wkt`, the
already-parsed shapely object (`results/handoff-comparison.json`, `kwargs_received`). So
the plugin would have to reach into the web framework's request object — `flask.request.
args['coords']` — from inside a provider, coupling the provider to Flask and to
pygeoapi's choice of it. Cost: about half a working session to write, and a permanent
compatibility liability at two seams instead of one.

Consequence for the read path: none visible from outside. The endpoint, the request and
the response shape are unchanged; only the plugin is uglier, and it must be tested against
the framework rather than against the standard.

Consequence for the client's centrepiece (FR-47): none. The client sees the same
CoverageJSON Trajectory either way.

This is a genuine fallback and it costs little. It is not needed today.

---

## Shelf life: re-run this spike when

- the deployment pins a pygeoapi version other than the `0.25.dev0` tested here,
  particularly across a major release, since `BaseEDRProvider.__init_subclass__` and the
  `query_args` dict are internal interfaces with no compatibility promise;
- Shapely or GEOS is upgraded, or the base image changes, since both halves of the pin
  are properties of the built artefact rather than of a declared dependency;
- pygeoapi gains a supplied trajectory provider, which would make FR-50's bespoke plugin
  reconsiderable;
- a POST form of the EDR query appears, which would remove the 91-vertex ceiling;
- the OGC API-EDR specification changes how a trajectory's vertex time is encoded. This
  spike used seconds since the Unix epoch in M. **That choice was not verified against the
  specification text** — the specification was not consulted during this run — and it is
  the one assumption in this finding resting on nothing but convention. The build should
  confirm it, and the client and provider must agree either way.

## Closure

Timebox: two working sessions. Used: one. Everything the spec asked to be established was
established, with the exception noted above (the M encoding against the specification
text) and one deliberate omission (FR-21's catalogue mechanism, which is the query-layer
feature's to design, not this spike's to guess at).

Two housekeeping items this spike could not fix, being outside the directory it owns:

- `.gitignore` excludes `*.nc`, so the fixture cannot be committed as SRD FR-017 and
  spec FR-017 ask. It is regenerated from its seed instead, which is arguably better and
  is consistent with NFR-07 ("seed data is produced by scripts, never accumulated"). If a
  committed fixture is genuinely wanted, `.gitignore` needs an exception.
- `spikes/` is not in `pyproject.toml`'s `[tool.ruff] extend-exclude`, and the lint-gate
  scripts (`check_no_wallclock.py` and the rest) do not exist yet. Feature 001 owns that
  list. The code here passes `ruff check` and `ruff format --check` as the project
  configures them, so the exclusion is a convenience rather than a necessity — but the
  literal paths, hosts and ports here are deliberate and will trip the literal-path gate
  when it lands.
