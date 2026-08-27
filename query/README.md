# C-09, the query layer

Everything drogna holds is read through here, and through nothing else. pygeoapi serves two
collections: OGC API-EDR over the coverage store, returning CoverageJSON, and a stated subset
of OGC SensorThings API Part 1 (Sensing) over the observation store.

Both are served by provider plugins written for this harness. That is not an abstraction
added for its own sake: no supplied pygeoapi provider implements EDR trajectory at all
(ADR-0003), and pygeoapi's `sensorthings` provider is an HTTP *client* that consumes an
external SensorThings service, so it cannot serve an entity set from a store of our own
(ADR-0004). Where a standard is ahead of its implementations, drogna writes the adapter.

Everything served here is synthetic. The numerics are deliberately fake.

## What is in this directory

| Path | What it is |
|---|---|
| `pygeoapi-config.yaml.template` | The configuration, with every value a placeholder. |
| `render_config.py` | Fills those placeholders from `config/<destination>/query.json`. |
| `plugins/coverage_catalogue.py` | Resolves runs from the coverage store's layout at request time. |
| `plugins/netcdf_reader.py` | Classic NetCDF, decoded without a library. |
| `plugins/interpolation.py` | Linear in four dimensions; null outside the domain. |
| `plugins/coveragejson.py` | Point, Grid and Trajectory domains, and the referencing. |
| `plugins/edr_coverage.py` | The EDR provider: position and cube. |
| `plugins/edr_trajectory.py` | The bespoke trajectory provider: per-vertex arrival times. |
| `plugins/sensorthings_entities.py` | The entity model, the path grammar, the navigation links. |
| `plugins/sensorthings_options.py` | The implemented query options, and the refusals. |
| `plugins/sensorthings_provider.py` | The SensorThings provider and its row sources. |
| `plugins/pygeoapi_version.py` | One version pin, checked by both providers before serving. |
| `plugins/heartbeat.py` | Liveness on `ctl/heartbeat`. |
| `conformance.md` | What of SensorThings Part 1 is implemented, and what is not. |

No file here contains a hostname, a port, a URL or a path. A pygeoapi configuration is
conventionally written full of all four, which is why the literal-path gate covers this
directory and does not cover `config/` or `deploy/`.

## The path space

```text
<public base>/<collection prefix>/collections/forecast
<public base>/<collection prefix>/collections/forecast/position
<public base>/<collection prefix>/collections/forecast/cube
<public base>/<collection prefix>/collections/forecast/trajectory
<public base>/<collection prefix>/collections/forecast/instances/<run id>/...
<public base>/<collection prefix>/collections/observations
<public base>/<collection prefix>/collections/observations/items
<public base>/<collection prefix>/collections/observations/items/<EntitySet>
<public base>/<collection prefix>/collections/observations/items/<EntitySet>('<id>')
<public base>/<collection prefix>/collections/observations/items/<EntitySet>('<id>')/<NavigationProperty>
```

The prefix is one configuration value and every collection sits under it. That is what makes
prefix-based default-deny at the reverse proxy viable: adding a collection must not change
the shape of the path space, and nothing here can (FR-023). Access control itself belongs to
the proxy feature; this one guarantees only the property that makes its approach workable.

## Two collections, not one per run

Runs are not collections. The `forecast` collection serves whichever run the coverage store
currently names, resolved from the store's layout at request time, and earlier runs are
reached as EDR *instances* of that same collection. Publishing a run therefore edits no file,
adds no collection and restarts nothing (FR-017, FR-021). `stores/coverage/layout.md` is the
contract the publisher honours to make that true, and it is normative.

## There is no freshness endpoint

Deliberately. The query layer has no notification mechanism, and polling it for freshness
would invent one — a consumer would learn about a new run at the resolution of its own poll
interval, which is a host clock deciding when the harness is allowed to have moved on. A new
run is announced on `ctl/run-published`, and that is how a consumer learns (FR-022).

## Response limits

Every limit is a configuration value, and every refusal names the limit it enforced. The
values both destinations carry are in `config/<destination>/query.json`; the droplet's are
smaller, which is the only difference between the two.

| Limit | Local | Droplet | What happens at the limit |
|---|---|---|---|
| `cube_maximum_cells` | 250,000 | 120,000 | Refused, with the cell count and the limit stated. Never truncated. |
| `trajectory_maximum_vertices` | 91 | 91 | Refused, with the vertex count and the limit stated. Never truncated. |
| `page_size_default` | 100 | 100 | The page size when `$top` names none. |
| `page_size_maximum` | 1,000 | 500 | `$top` above this is bounded to it. |

The trajectory bound is 91 for a measured reason rather than a chosen one. A GET trajectory
at six decimal places tops out around there: feature 002 measured 91 vertices as a 4,081-byte
request line that works and 92 as 4,125 bytes refused with `Request Line is too large`. That
is gunicorn's `limit_request_line` default, not anything about EDR, and there is no POST form
of the query — the endpoint answers 405. Refusing at 91 with the limit named is better than
being refused at 92 by a message about HTTP. The ceiling is the length of the whole request
line, so a longer collection name eats into it: at drogna's own path a 91-vertex route is
4,190 bytes, which is over that default. If the deployment raises
`limit_request_line`, raise this limit with it and re-measure; the two belong together.

The framework also passes a `limit` to trajectory queries, defaulting to ten. It is a records
limit and this provider ignores it: honouring it naively would answer a twenty-vertex route
with ten values and HTTP 200, which is the failure this whole component is arranged to avoid.

## How a value between grid nodes is arrived at

Linear in longitude, latitude, depth and time. Stated because neither this nor its
alternative is visible in a response.

- **Exactly on a grid node**: the stored value, with no arithmetic between neighbours.
- **Exactly between two nodes**: their mean, which is what linear means there.
- **On the first or last node of an axis**: inside the domain, not outside.
- **Outside the domain in any axis**: `null`. Never extrapolation.

That last one is one word of code and invisible from outside: the same provider configured
to extrapolate returns plausible values beyond the forecast horizon, with HTTP 200 and
nothing in the response to say so. A forecast horizon that silently extends itself is the
worst answer available to this component, so out-of-domain vertices are **declined
explicitly**: their values are null, and they are also listed in the response under
`drogna:declined` with the axis and the extent that excluded them. A null in an array is
indistinguishable from a missing measurement, and this is neither — it is a refusal to
extrapolate, which the caller is entitled to see stated.

## Measured interpolation error

Against a field with a closed form, so that the expected value at an off-grid point is
arithmetic rather than a second interpolation. Reported as figures, with the grid spacing
beside them, because "the values agree" means nothing without one (Constitution IX).

Grid spacing of the fixture: 0.60° longitude, 0.50° latitude, 100 m depth, 3600 s.

| Query | Worst absolute error against the field |
|---|---|
| Position, 20 probes over 4 parameters | 5.7 × 10⁻¹⁴ |
| Trajectory, 4 vertices, temperature | 7.1 × 10⁻¹⁵ °C |
| AT-01, 20 vertices, temperature | 6.1 × 10⁻¹¹ °C |

Those are the arithmetic's own error and not the method's, because the fixture field is
exactly representable by quadrilinear interpolation. What the figures beside them are for is
the comparison that matters:

| The same AT-01 route, scored differently | Worst absolute error |
|---|---|
| Each vertex at its own arrival time | 6.1 × 10⁻¹¹ °C |
| The whole route at one query time | 1.3 °C |
| Each vertex snapped to the nearest coverage step | 2.2 × 10⁻¹ °C |

The middle row is the failure mode that produces a structurally correct response nobody can
tell from a right one. The bottom row is why the provider interpolates in time rather than
snapping: snapping is invisible from outside and would put a fifth of a degree of the
harness's own arithmetic into what AT-01 reports as recovery.

Reproduce with `uv run pytest tests/acceptance/test_at01_trajectory.py -s`, which prints the
table.

## Measured response times

Against the built query layer image running pygeoapi 0.20.0 with these plugins, over a
two-run coverage store on a 5 × 4 × 5 × 6 grid, warm. Development figures on a development
host, not the droplet's: the droplet has not been provisioned, and quoting a number from
this machine as though it were that one would be the kind of claim this repository exists
not to make.

| Query | Time |
|---|---|
| Position, four parameters | 3.5 ms (21.9 ms cold, the file being decoded) |
| Trajectory, 91 vertices, one parameter | 6.2 ms, 6,952 bytes |
| Cube, whole domain, four parameters, 600 cells | 21.7 ms |

The plan's targets were two hundred milliseconds for a position query and two seconds for a
hundred-vertex trajectory. Both are met with room, on a grid smaller than a run's will be;
the figures are worth re-taking on the droplet against a full-sized run, and the documented
limits adjusted to what it can actually serve.

## Trajectory queries and the version pin

Vertex times arrive as the M ordinate of a WKT `LINESTRING M` or `LINESTRING ZM` in the
`coords` parameter, as seconds since the Unix epoch. pygeoapi parses that string with Shapely
before any provider code runs, so the pin in `deploy/images/query-layer.requirements.txt` —
Shapely 2.1 or later built against GEOS 3.12 or later — is load-bearing. Below it the
arrival times are lost silently, in one of three ways, and nothing raises. The provider
refuses rather than falling back to a single time; the image asserts the pin at build time;
`tests/unit/test_wkt_m_ordinate.py` asserts it where the provider runs.

WKT Z is elevation, positive up. The coverage's axis is depth, positive down. `depth = -z`.
A route with no Z takes `interpolation.default_depth_metres`, explicitly, because a default
chosen by accident here is invisible.

A route whose vertex times do not increase is refused with the offending vertex named. It is
not reordered: reordering answers a route nobody asked for.

## What pygeoapi's routing does and does not give the SensorThings collection

Measured against the running service, not assumed. A pygeoapi provider plugin can implement
behaviour; it cannot add URL routes, and it is not handed query parameters the framework does
not recognise. Both matter here, and both have answers.

The path grammar arrives intact. pygeoapi routes `/collections/<id>/items/<path:item_id>`, so
`/collections/observations/items/Datastreams('ds-temperature')/Observations` reaches the
provider with its slashes and quotes unaltered, and the whole grammar — an entity set, an
entity, one navigation step — is reachable without pygeoapi knowing anything about
SensorThings.

The query options do not. `get()` is handed an identifier, a language and a CRS transform and
nothing else; an unrecognised query parameter is either dropped or rejected as an unknown
property filter. So `request_query_options()` in `plugins/sensorthings_provider.py` reads the
`$`-prefixed parameters off the web request directly. That is the one place in this component
that reaches past the provider interface. It is confined to two short functions, it degrades
to "no options given" where there is no request in flight, and everything above it — the
entity model, the grammar, the options and their refusals — is framework-free and tested
without a web request in sight. Feature 002's spike anticipated this shape of problem and
judged it a genuine fallback that costs little; the cost is a coupling to pygeoapi's choice
of web framework, at one seam.

`/collections/observations/items` itself is an OGC API - Features resource, and this
collection has no features. It answers with an empty feature collection — pygeoapi's own
handler reads `features` off the result and fails without one — carrying the service root and
the conformance statement beside it, so a consumer starting there is pointed at the entity
sets rather than at an error.

## Running it

The image is `deploy/images/query-layer.Dockerfile` and the service is `query` in
`deploy/compose.yaml`, under the `query` profile. `render_config.py` turns
`config/<destination>/query.json` into the file pygeoapi reads; the plugins are selected by
dotted module path in each collection's provider `name`, so the whole of the wiring is that
`PYTHONPATH` reaches this directory inside the container.

Two things about the image are not yet true, and are recorded here rather than discovered:
it does not yet copy `query/` or set that `PYTHONPATH` — the lines are present in the
Dockerfile, commented, waiting for this directory to exist — and it does not install
`harness-core`, which `plugins/heartbeat.py` and the simulation-time arithmetic need.
`deploy/` belongs to the Compose feature; both are one-line changes there.

## Checking a coverage store

```sh
python stores/coverage/validate_layout.py --config config/local/query.json --root <path>
```

It calls the same catalogue the query layer serves from, so a store it passes is a store the
query layer can read.
