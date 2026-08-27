---
title: OGC API-EDR
---

# OGC API-EDR

Most questions asked of an environmental dataset have a shape. What is it like
*here*. What is it like *inside this box*. What is it like *along this line, at
the moment I reach each point on it*. OGC API — Environmental Data Retrieval,
always shortened to EDR, is a web standard built on the observation that a short
list of shapes covers most of what anyone asks, and that a short list of shapes
can therefore stand in for a query language.

The attraction is that the list is closed. A client able to form those URLs can
ask everything the interface offers. There is no expression language to learn,
nothing to escape, and nothing the server has to defend itself against beyond
bounds it chooses for itself. EDR is the only way anything reads drogna's
[coverage store](../subsystems/c08-coverage-store.md), and the
[query layer](../subsystems/c09-query-layer.md) that serves it is pygeoapi,
configured with two provider plugins written for this harness.

This page is a primer for a reader who has not met the standard. It is also a
record of what happens to a query once it arrives, which is where the standard's
cleanest idea meets an implementation that was not built for it. Everything
below about pygeoapi's behaviour describes **pygeoapi 0.20.0**, the release the
deployment pins, read from `pygeoapi/api/environmental_data_retrieval.py` and
`pygeoapi/provider/base_edr.py` rather than from documentation. Where it differs
from the 0.25 development line that drogna's spike measured, the difference is
called out, because that divergence is one of the more instructive things here.

## The nine query types

A **collection** is a dataset. drogna publishes two: `forecast`, which carries
the current model run's forecast and uncertainty fields as parameters of one
collection, and `observations`, which is served through
[SensorThings](sensorthings.md) rather than EDR. A **query type** is one of nine
shapes, and it is a path segment in the URL rather than a parameter.

| Query type | The shape of the question | In drogna |
|---|---|---|
| `position` | One point. | Served |
| `radius` | A point and a distance around it. | Not served |
| `area` | A polygon. | Not served |
| `cube` | A bounding box, optionally with depth and time ranges. | Served |
| `trajectory` | A path, with a time at every vertex. | Served |
| `corridor` | A path swept into a volume: a [trajectory](../glossary.md#trajectory) given width and height. | Not served |

| `items` | The individually addressable things a collection holds. | Not served |
| `locations` | Named places the collection can be asked about. | Not served |
| `instances` | The versions of a collection. For drogna, the model runs. | Served |

Two of the five drogna does not serve turn out to be less available than the
table suggests, for reasons that have nothing to do with drogna: see [the
difference between the nine](#the-difference-between-the-nine-in-full).

Trajectory is the one drogna exists to exercise: given a planned route with a
timestamp at every vertex, return the conditions forecast for the *moment of
arrival* at each point, rather than the conditions at query time. For anything
moving slowly through a changing medium — which is to say a ship — that is the
only version of the question worth asking.

## How a question is written

```text
GET /collections/forecast/trajectory
    ?coords=LINESTRING ZM (-3.6 48.4 -5 1788220800, -2.55 49.45 -100 1788226668)
    &parameter-name=sea_water_temperature
    &datetime=2026-09-01T00:00:00Z/2026-09-02T00:00:00Z
    &z=0
    &f=json
```

Nothing about it is exotic, and that is the point. `parameter-name` selects
variables by name; `datetime` is an instant or a `begin/end` interval; `z`
selects depth; `f` selects the response format. The geometry travels in `coords`
as **WKT**.

WKT — Well-Known Text — is the ordinary text spelling of a geometry:
`POINT (-3.6 48.4)`, `LINESTRING (-3.6 48.4, -2.55 49.45)`. Past longitude and
latitude it allows two optional ordinates per vertex. **Z** is conventionally
elevation. **M** is a *measure*, deliberately left undefined by WKT itself:
whatever the application chooses. EDR chooses the vertex's time. So a
four-dimensional route is one string, and the timetable rides inside the geometry
rather than alongside it. It is a genuinely elegant fit.

drogna writes M as seconds since the Unix epoch. Feature 002's spike used that
encoding and recorded honestly that it had not checked the choice against the
specification text; it is the one assumption in the trajectory path that rests on
convention rather than on measurement. The client and the provider agree on it in
one named constant, because a disagreement between them would produce a plausible
wrong answer rather than an error.

## What actually happens to a query

The figure below is the mechanism, top to bottom, for pygeoapi 0.20.0. The prose
after it says the same things in the same order, so nothing here depends on
seeing it.

<figure>
<div style="overflow-x:auto">
<svg class="edrd" viewBox="0 0 900 736" role="img" aria-labelledby="edrd-title edrd-desc" preserveAspectRatio="xMidYMid meet" style="width:100%;min-width:780px;height:auto">
<title id="edrd-title">How pygeoapi handles an OGC API-EDR query, and what each query type meets</title>
<desc id="edrd-desc">A top-to-bottom flow in four stages. First, the request: a GET to /collections/forecast/{query type} with coords, datetime, parameter-name, z, bbox, within and limit as optional query-string parameters. Second, a panel labelled pygeoapi 0.20.0, api/environmental_data_retrieval.py, containing everything that runs before any drogna code and none of it configurable. Inside that panel: query_type is checked against the provider's advertised list, and a type not in it returns 400 Unsupported query type; coords is passed to shapely.wkt.loads and the resulting geometry is handed on untouched, which is where the M ordinate carrying every vertex's arrival time either survives or is silently lost, decided by the installed Shapely and GEOS versions in three ways, none of which raises; datetime is validated against the collection's configured extent; parameter-name is checked against the provider's fields and an unknown name returns 400; bbox is validated and required only for cube; z, within and limit are passed through unexamined, with limit defaulting to ten and counting records rather than vertices; and the raw query strings are not passed on at all, so the provider receives the parsed geometry and never the text it came from. Third, dispatch: twelve keyword arguments in one dict, then BaseEDRProvider.query calls getattr on the provider for the query type's name. Fourth, the fan-out. Four query types are answered by drogna's plugin class: position, a single point, supplied by the xarray-edr provider, returning a CoverageJSON Point domain; cube, a bounding box, also supplied, returning a Grid domain; trajectory, a path with a time at every vertex, for which pygeoapi supplies nothing at all, returning a Trajectory domain; and instances, which model run, for which pygeoapi also supplies nothing, returning a list of run identifiers. Five query types are refused because drogna's provider does not advertise them: radius, area, corridor, items and locations, each returning 400 Unsupported query type before the provider is called. A marker labelled M appears twice: on the coords step where the per-vertex arrival time is decided, and on the trajectory query type, the only one that depends on it.</desc>
<style>
svg.edrd { color: var(--md-default-fg-color--light); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
svg.edrd .b { fill: var(--md-code-bg-color); stroke: var(--md-default-fg-color--lighter); stroke-width: 1; }
svg.edrd .bd { fill: none; stroke: var(--md-default-fg-color--lighter); stroke-width: 1; stroke-dasharray: 5 4; }
svg.edrd .panel { fill: var(--md-default-fg-color--lightest); stroke: var(--md-default-fg-color--lighter); stroke-width: 1; }
svg.edrd .hz { fill: var(--md-code-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrd .hzb { fill: var(--md-code-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrd .t { fill: var(--md-default-fg-color); font-size: 13px; }
svg.edrd .th { fill: var(--md-default-fg-color); font-size: 13.5px; font-weight: 600; }
svg.edrd .s { fill: var(--md-default-fg-color--light); font-size: 11px; }
svg.edrd .a { fill: var(--md-default-fg-color); font-size: 12.5px; font-weight: 600; }
svg.edrd .lbl { fill: var(--md-default-fg-color--light); font-size: 10.5px; letter-spacing: 0.09em; }
svg.edrd .m { fill: var(--md-default-fg-color); font-size: 12px; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
svg.edrd .ln { stroke: currentColor; stroke-width: 1.4; fill: none; }
svg.edrd .dot { fill: var(--md-default-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrd .dotl { fill: var(--md-default-fg-color); font-size: 9.5px; font-weight: 700; }
svg.edrd #edrd-head path { fill: var(--md-default-fg-color--light); }
</style>
<defs>
<marker id="edrd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
</defs>

<rect class="b" x="140" y="18" width="620" height="54" rx="6"/>
<text class="m" x="450" y="42" text-anchor="middle">GET /collections/forecast/{query type}?coords=…&amp;datetime=…</text>
<text class="s" x="450" y="61" text-anchor="middle">plus parameter-name, z, bbox, within, limit — all optional, all query string</text>
<line class="ln" x1="450" y1="72" x2="450" y2="92" marker-end="url(#edrd-head)"/>

<rect class="panel" x="30" y="94" width="840" height="314" rx="8"/>
<text class="lbl" x="48" y="118">PYGEOAPI 0.20.0 · api/environmental_data_retrieval.py</text>
<text class="s" x="48" y="137">Everything in this panel runs before any drogna code, and none of it is configurable.</text>

<text class="m" x="48" y="168">query_type</text>
<text class="t" x="196" y="168">Is it in the provider's advertised list? If not, 400 Unsupported query type.</text>

<rect class="hz" x="44" y="182" width="812" height="84" rx="5"/>
<circle class="dot" cx="64" cy="207" r="8"/>
<text class="dotl" x="64" y="210.5" text-anchor="middle">M</text>
<text class="m" x="84" y="211">coords → shapely.wkt.loads(coords) → a Shapely geometry, handed on untouched</text>
<text class="a" x="84" y="233">The M ordinate — every vertex's arrival time — either survives this call or is silently lost.</text>
<text class="s" x="84" y="253">Decided by the installed Shapely and GEOS. Three ways to lose it, and none of them raises.</text>

<text class="m" x="48" y="294">datetime</text>
<text class="t" x="196" y="294">validate_datetime() against the collection's configured extent. 400 outside it.</text>
<text class="m" x="48" y="318">parameter-name</text>
<text class="t" x="196" y="318">Checked against the provider's get_fields(). 400 InvalidParameterValue.</text>
<text class="m" x="48" y="342">bbox</text>
<text class="t" x="196" y="342">validate_bbox(). Required for cube; not read for the others.</text>
<text class="m" x="48" y="366">z · within · limit</text>
<text class="t" x="196" y="366">Passed through unexamined. limit defaults to 10 and counts records, not vertices.</text>
<text class="m" x="48" y="390">the raw strings</text>
<text class="t" x="196" y="390">Not passed on. The provider gets the parsed geometry, never the text it came from.</text>

<line class="ln" x1="450" y1="408" x2="450" y2="430" marker-end="url(#edrd-head)"/>

<rect class="b" x="180" y="432" width="540" height="62" rx="6"/>
<text class="m" x="450" y="457" text-anchor="middle">query_args — twelve keyword arguments in one dict</text>
<text class="m" x="450" y="479" text-anchor="middle">BaseEDRProvider.query() → getattr(self, query_type)(**query_args)</text>

<line class="ln" x1="450" y1="494" x2="450" y2="512"/>
<line class="ln" x1="320" y1="512" x2="750" y2="512"/>
<line class="ln" x1="320" y1="512" x2="320" y2="526" marker-end="url(#edrd-head)"/>
<line class="ln" x1="750" y1="512" x2="750" y2="526" marker-end="url(#edrd-head)"/>

<rect class="panel" x="30" y="528" width="580" height="172" rx="8"/>
<text class="lbl" x="46" y="552">ANSWERED — ONE DROGNA PROVIDER CLASS</text>

<rect class="b" x="44" y="564" width="132" height="114" rx="5"/>
<text class="th" x="110" y="590" text-anchor="middle">position</text>
<text class="s" x="110" y="614" text-anchor="middle">a single point</text>
<text class="s" x="110" y="632" text-anchor="middle">supplied: xarray-edr</text>
<text class="s" x="110" y="658" text-anchor="middle">→ Point domain</text>

<rect class="b" x="186" y="564" width="132" height="114" rx="5"/>
<text class="th" x="252" y="590" text-anchor="middle">cube</text>
<text class="s" x="252" y="614" text-anchor="middle">a bounding box</text>
<text class="s" x="252" y="632" text-anchor="middle">supplied: xarray-edr</text>
<text class="s" x="252" y="658" text-anchor="middle">→ Grid domain</text>

<rect class="hzb" x="328" y="564" width="132" height="114" rx="5"/>
<circle class="dot" cx="344" cy="578" r="8"/>
<text class="dotl" x="344" y="581.5" text-anchor="middle">M</text>
<text class="th" x="394" y="590" text-anchor="middle">trajectory</text>
<text class="s" x="394" y="612" text-anchor="middle">a path with a time</text>
<text class="s" x="394" y="628" text-anchor="middle">at every vertex</text>
<text class="s" x="394" y="646" text-anchor="middle">supplied: nothing</text>
<text class="s" x="394" y="668" text-anchor="middle">→ Trajectory domain</text>

<rect class="b" x="470" y="564" width="132" height="114" rx="5"/>
<text class="th" x="536" y="590" text-anchor="middle">instances</text>
<text class="s" x="536" y="612" text-anchor="middle">which model run,</text>
<text class="s" x="536" y="628" text-anchor="middle">named or current</text>
<text class="s" x="536" y="658" text-anchor="middle">→ a list of run ids</text>

<rect class="panel" x="630" y="528" width="240" height="172" rx="8"/>
<text class="lbl" x="646" y="552">REFUSED — NOT ADVERTISED</text>
<rect class="bd" x="644" y="564" width="212" height="114" rx="5"/>
<text class="t" x="750" y="594" text-anchor="middle">radius · area · corridor</text>
<text class="t" x="750" y="618" text-anchor="middle">items · locations</text>
<text class="s" x="750" y="646" text-anchor="middle">400 Unsupported query type,</text>
<text class="s" x="750" y="664" text-anchor="middle">before the provider is called.</text>

<circle class="dot" cx="38" cy="714" r="8"/>
<text class="dotl" x="38" y="717.5" text-anchor="middle">M</text>
<text class="s" x="54" y="718">marks where the per-vertex arrival time is decided, and the one query type that depends on it.</text>
</svg>
</div>
<figcaption>An EDR query in pygeoapi 0.20.0: what the framework does to each parameter, how it dispatches, and what each of the nine query types meets in drogna's collection.</figcaption>
</figure>

The framework's work is the top two-thirds of that picture, and it is worth
saying plainly what it amounts to. pygeoapi checks that the query type is one the
provider claims to support, validates `datetime` against the extent written in
the collection's configuration, rejects a `parameter-name` the provider does not
declare, validates `bbox` where a cube needs one, parses `coords` with
`shapely.wkt.loads`, packs twelve keyword arguments into a dict, and calls a
method on the provider named after the query type. That is the entire framework
contribution. Everything else — sampling, interpolation, the response document —
is the provider's.

### The vertex time is decided before the plugin, not inside it

The single most useful thing the figure shows is that the `coords` step sits
inside the framework panel. pygeoapi parses the WKT and hands the resulting
geometry to the provider *untouched*, which is a virtue: nothing in the framework
has an opinion about what M means, so a provider is free to say that it means
arrival time. It is also the vulnerability, because whether M is still there when
the geometry arrives is settled by the installed geometry library, upstream of
every line of code drogna writes.

Shapely is a Python wrapper around GEOS, a C library, and the two fail
independently. Feature 002 built three combinations and probed them with the same
two strings.

| Shapely | GEOS | What happens to M |
|---|---|---|
| 2.1.2 | 3.13.1 | Every vertex time recovered exactly, in order. This is the pin. |
| ≥ 2.1 | < 3.12 | Returned as **NaN**. `shapely.has_m` raises `UnsupportedGEOSVersionError` here rather than returning `False`, so a guard written in terms of it errors out instead of failing informatively. |
| 2.0.x | ≥ 3.12 | Not NaN — **absent**. There is no `include_m` parameter and no `has_m` attribute to interrogate. `LINESTRING ZM` yields `(x, y, z)` tuples and round-trips back out as `LINESTRING Z`. This is the published pygeoapi image as it ships. |
| 2.0.x | < 3.12 | `LINESTRING M` comes back as a `LINESTRING Z` **whose Z values are the timestamps**, with `has_z` reporting true. A provider reading Z as elevation takes 1,788,220,800 for a depth in metres. |

Three ways to fail, and not one of them raises. No exception, no warning, no
degraded status. The default outcome of losing M is a provider quietly evaluating
the whole route at a single time and returning HTTP 200 with values that look
entirely reasonable: for the twenty-vertex route the spike measured, wrong by
12.8 °C against 2.7 × 10⁻⁸ °C for the correct answer. The full account is in
[three ways to lose a timestamp](../blog/posts/three-ways-to-lose-a-timestamp.md).

drogna's response is in three parts. The deployment pins Shapely 2.1 or later
with the reason written at the pin. The image build parses a known
`LINESTRING ZM` and asserts that M comes back exactly *and* that Z is still the
elevations, because a check on M alone cannot tell a correct parse from one that
has moved the times into the depth axis. And the provider itself refuses: if any
M is NaN or the geometry parses to fewer than four ordinates per vertex, the
query is declined with a message naming the pin, rather than falling back to a
single time.

### What the provider is handed, and what it is not

The dispatch dict is generous — `query_type`, `instance`, `format_`,
`datetime_`, `select_properties`, `wkt`, `z`, `bbox`, `within`, `within_units`,
`limit` and `location_id` — but the raw `coords` string is not in it. Only the
already-parsed geometry is. So if M ever stopped surviving the parse, a plugin
could not simply re-read the text: it would have to reach into the web
framework's request object from inside a provider, coupling the provider to
Flask and to pygeoapi's choice of it.

The collection next door has to do exactly that. drogna's SensorThings collection
is served through pygeoapi's Features interface, and there `get()` is handed an
identifier, a language and a CRS transform, and nothing else; an unrecognised
query parameter is dropped or rejected as an unknown property filter. The
`$`-prefixed options SensorThings needs cannot arrive any other way, so one
function reads them off the Flask request directly. That is the only place in the
query layer that reaches past the provider interface, and it is confined to two
short functions so that everything above it stays testable without a web request
in sight.

`limit` deserves a note of its own. The framework passes one to trajectory
queries, defaulting to ten. It is a *records* limit, and a provider that honoured
it naively would answer a twenty-vertex route with ten values and HTTP 200 —
precisely the class of failure this component is arranged to avoid. drogna's
provider ignores it and bounds routes by a configured vertex count instead,
refusing rather than truncating.

### The difference between the nine, in full

The figure above shows one handler serving every query type. That raises a fair
question: if there is one handler, what actually makes a `cube` query different
from a `trajectory` one?

The answer is smaller than the standard makes it look. Between the nine query
types there are exactly **three conditionals** in the whole of
`api/environmental_data_retrieval.py`, and everything else every query type
receives is identical. The figure below is the full accounting; the prose after it
says the same things.

<figure>
<div style="overflow-x:auto">
<svg class="edrq" viewBox="0 0 900 522" role="img" aria-labelledby="edrq-title edrq-desc" preserveAspectRatio="xMidYMid meet" style="width:100%;min-width:800px;height:auto">
<title id="edrq-title">What pygeoapi parses for each EDR query type, and what it does not</title>
<desc id="edrq-desc">A table drawn as a grid, nine rows and six columns, showing what pygeoapi 0.20.0 parses for each OGC API-EDR query type before it calls a provider. The columns are: coords, which is passed to shapely.wkt.loads; bbox; within and within-units; location_id taken from the path; and the parameters common to every query type, namely datetime, z, parameter-name and limit. position, radius, area, trajectory and corridor all require coords. radius alone also reads within and within-units. cube does not read coords at all and requires bbox instead. locations does not read coords either, reads bbox optionally, and takes a location_id from the path. Every one of those receives the common parameters. Two rows are marked as losing something. corridor is routed and its coords are parsed, but corridor-width, corridor-height, their units and the two resolution parameters are not read anywhere in the release, so the parameters that make a corridor a corridor never reach the provider. items is worse: no EDR route is registered for it at all in any of the three web frameworks pygeoapi ships, so the whole query type is unreachable; the /items path that does exist belongs to the Features API, not to EDR. trajectory is marked with an M badge: it is the only query type whose coords carry a per-vertex time, and whether that time survives shapely.wkt.loads depends on the installed Shapely and GEOS versions. instances is answered by a different function entirely, before any of this parsing runs. Of the nine, drogna serves four: position, cube, trajectory and instances.</desc>
<style>
svg.edrq { color: var(--md-default-fg-color--light); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
svg.edrq .row { fill: var(--md-code-bg-color); stroke: none; }
svg.edrq .rowalt { fill: none; stroke: none; }
svg.edrq .warn { fill: var(--md-code-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrq .grid { stroke: var(--md-default-fg-color--lighter); stroke-width: 1; }
svg.edrq .t { fill: var(--md-default-fg-color); font-size: 12px; }
svg.edrq .qt { fill: var(--md-default-fg-color); font-size: 13px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
svg.edrq .sub { fill: var(--md-default-fg-color--light); font-size: 9.5px; }
svg.edrq .s { fill: var(--md-default-fg-color--light); font-size: 10.5px; }
svg.edrq .hd { fill: var(--md-default-fg-color); font-size: 10.5px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
svg.edrq .hs { fill: var(--md-default-fg-color--light); font-size: 9px; }
svg.edrq .lbl { fill: var(--md-default-fg-color--light); font-size: 10px; letter-spacing: 0.09em; }
svg.edrq .dim { fill: var(--md-default-fg-color--light); font-size: 12px; }
svg.edrq .dot { fill: var(--md-default-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrq .dotl { fill: var(--md-default-fg-color); font-size: 9px; font-weight: 700; }
</style>
<text class="lbl" x="24" y="26">PYGEOAPI 0.20.0 · WHAT REACHES THE PROVIDER, BY QUERY TYPE</text>
<text class="s" x="24" y="44">One handler serves every routed query type. These five conditionals are the whole of the difference between them.</text>
<text class="hd" x="192" y="62" text-anchor="middle">coords</text>
<text class="hs" x="192" y="74" text-anchor="middle">shapely.wkt.loads</text>
<text class="hd" x="276" y="62" text-anchor="middle">bbox</text>
<text class="hd" x="360" y="62" text-anchor="middle">within</text>
<text class="hs" x="360" y="74" text-anchor="middle">within-units</text>
<text class="hd" x="444" y="62" text-anchor="middle">location_id</text>
<text class="hs" x="444" y="74" text-anchor="middle">from the path</text>
<text class="hd" x="528" y="62" text-anchor="middle">common</text>
<text class="hs" x="528" y="74" text-anchor="middle">datetime · z · limit</text>
<text class="hs" x="528" y="85" text-anchor="middle">parameter-name</text>
<text class="hd" x="584" y="62">what never arrives</text>
<text class="hs" x="584" y="74">of what this query type is defined by</text>
<line class="grid" x1="24" y1="98" x2="876" y2="98"/>
<rect class="row" x="24" y="100" width="852" height="34" rx="3"/>
<text class="qt" x="34" y="116">position</text>
<text class="sub" x="34" y="129">served</text>
<text class="t" x="192" y="120" text-anchor="middle">required</text>
<text class="dim" x="276" y="120" text-anchor="middle">—</text>
<text class="dim" x="360" y="120" text-anchor="middle">—</text>
<text class="dim" x="444" y="120" text-anchor="middle">—</text>
<text class="t" x="528" y="120" text-anchor="middle">✓</text>
<text class="s" x="584" y="114">—</text>
<line class="grid" x1="24" y1="136" x2="876" y2="136"/>
<text class="qt" x="34" y="154">radius</text>
<text class="sub" x="34" y="167">not advertised</text>
<text class="t" x="192" y="158" text-anchor="middle">required</text>
<text class="dim" x="276" y="158" text-anchor="middle">—</text>
<text class="t" x="360" y="158" text-anchor="middle">✓</text>
<text class="dim" x="444" y="158" text-anchor="middle">—</text>
<text class="t" x="528" y="158" text-anchor="middle">✓</text>
<text class="s" x="584" y="152">—</text>
<line class="grid" x1="24" y1="174" x2="876" y2="174"/>
<rect class="row" x="24" y="176" width="852" height="34" rx="3"/>
<text class="qt" x="34" y="192">area</text>
<text class="sub" x="34" y="205">not advertised</text>
<text class="t" x="192" y="196" text-anchor="middle">required</text>
<text class="dim" x="276" y="196" text-anchor="middle">—</text>
<text class="dim" x="360" y="196" text-anchor="middle">—</text>
<text class="dim" x="444" y="196" text-anchor="middle">—</text>
<text class="t" x="528" y="196" text-anchor="middle">✓</text>
<text class="s" x="584" y="190">—</text>
<line class="grid" x1="24" y1="212" x2="876" y2="212"/>
<text class="qt" x="34" y="230">cube</text>
<text class="sub" x="34" y="243">served</text>
<text class="t" x="192" y="234" text-anchor="middle">not read</text>
<text class="t" x="276" y="234" text-anchor="middle">required</text>
<text class="dim" x="360" y="234" text-anchor="middle">—</text>
<text class="dim" x="444" y="234" text-anchor="middle">—</text>
<text class="t" x="528" y="234" text-anchor="middle">✓</text>
<text class="s" x="584" y="228">—</text>
<line class="grid" x1="24" y1="250" x2="876" y2="250"/>
<rect class="row" x="24" y="252" width="852" height="34" rx="3"/>
<text class="qt" x="34" y="268">trajectory</text>
<text class="sub" x="34" y="281">served</text>
<text class="t" x="192" y="272" text-anchor="middle">required</text>
<text class="dim" x="276" y="272" text-anchor="middle">—</text>
<text class="dim" x="360" y="272" text-anchor="middle">—</text>
<text class="dim" x="444" y="272" text-anchor="middle">—</text>
<text class="t" x="528" y="272" text-anchor="middle">✓</text>
<circle class="dot" cx="192" cy="286" r="7.5"/>
<text class="dotl" x="192" y="289" text-anchor="middle">M</text>
<text class="s" x="584" y="266">nothing — but the M ordinate inside</text>
<text class="s" x="584" y="278">coords may not survive the parse</text>
<line class="grid" x1="24" y1="288" x2="876" y2="288"/>
<rect class="warn" x="24" y="290" width="852" height="34" rx="4"/>
<text class="qt" x="34" y="306">corridor</text>
<text class="sub" x="34" y="319">not advertised</text>
<text class="t" x="192" y="310" text-anchor="middle">required</text>
<text class="dim" x="276" y="310" text-anchor="middle">—</text>
<text class="dim" x="360" y="310" text-anchor="middle">—</text>
<text class="dim" x="444" y="310" text-anchor="middle">—</text>
<text class="t" x="528" y="310" text-anchor="middle">✓</text>
<text class="s" x="584" y="304">corridor-width, corridor-height, their</text>
<text class="s" x="584" y="316">units, resolution-x, resolution-z</text>
<line class="grid" x1="24" y1="326" x2="876" y2="326"/>
<rect class="warn" x="24" y="328" width="852" height="34" rx="4"/>
<text class="qt" x="34" y="344">items</text>
<text class="sub" x="34" y="357">not advertised</text>
<text class="dim" x="360" y="348" text-anchor="middle">no route — nothing is parsed</text>
<text class="s" x="584" y="342">everything — no EDR route is registered</text>
<text class="s" x="584" y="354">for this query type at all</text>
<line class="grid" x1="24" y1="364" x2="876" y2="364"/>
<text class="qt" x="34" y="382">locations</text>
<text class="sub" x="34" y="395">not advertised</text>
<text class="t" x="192" y="386" text-anchor="middle">not read</text>
<text class="t" x="276" y="386" text-anchor="middle">optional</text>
<text class="dim" x="360" y="386" text-anchor="middle">—</text>
<text class="t" x="444" y="386" text-anchor="middle">✓</text>
<text class="t" x="528" y="386" text-anchor="middle">✓</text>
<text class="s" x="584" y="380">—</text>
<line class="grid" x1="24" y1="402" x2="876" y2="402"/>
<rect class="row" x="24" y="404" width="852" height="34" rx="3"/>
<text class="qt" x="34" y="420">instances</text>
<text class="sub" x="34" y="433">served</text>
<text class="dim" x="360" y="424" text-anchor="middle">not parsed here at all</text>
<text class="s" x="584" y="418">nothing — it is answered by a different</text>
<text class="s" x="584" y="430">function, before any of the above</text>
<line class="grid" x1="24" y1="440" x2="876" y2="440"/>
<text class="s" x="24" y="466">Every routed query type also receives datetime validated against the collection's extent, parameter-name validated against the</text>
<text class="s" x="24" y="481">provider's fields, z passed through unexamined, and limit — which counts records, defaults to ten, and is not a vertex bound.</text>
</svg>
</div>
<figcaption>What pygeoapi 0.20.0 parses for each EDR query type before calling a provider: five conditionals, of which three are the whole difference between the nine. Two query types lose something on the way, and one of those never arrives at all.</figcaption>
</figure>

The three conditionals are these. `bbox` is validated only for `cube` and
`locations`, and is required for `cube`. `coords` is passed to
`shapely.wkt.loads` for every query type *except* those same two, and is required
— a `position` query without `coords` is a 400, and so is an `area` one. `within`
and `within-units` are read only for `radius`. That is the entire difference.
Everything else — `datetime` validated against the collection's extent,
`parameter-name` validated against the provider's fields, `z` passed through
unexamined, `limit` defaulting to ten — every routed query type gets the same.

`instances` is not in that accounting because it never reaches it: the route
handler notices an instances path and calls a different function before any
parameter parsing runs.

Two of the nine come out worse than the others, and both are worth knowing about
before designing around them.

**`corridor` is routed but disarmed.** The standard defines a corridor as a
trajectory swept into a volume, and the parameters that do the sweeping are
`corridor-width`, `corridor-height`, their two unit parameters, and
`resolution-x` and `resolution-z`. None of those strings appears anywhere in
pygeoapi 0.20.0 outside the route declarations and the list of query type names.
They are not parsed, not validated, and not placed in the dispatch dict. A
provider answering a `corridor` query receives a parsed `LINESTRING` and no width
— which is to say it receives a `trajectory` query wearing a different name.

**`items` has no route.** `EDR_QUERY_TYPES` in `provider/base_edr.py` lists nine
names, and the EDR route tables in all three web frameworks pygeoapi ships —
Flask, Starlette and Django — declare eight of them. `items` is absent from every
one. The `/collections/{id}/items` path that does exist belongs to the Features
API and dispatches to the Features interface, so a provider that advertises EDR
`items` and implements the method will find that nothing can call it. The query
type can be advertised in the collection metadata and remain unreachable, and
nothing anywhere reports the discrepancy.

Neither of these affects drogna, which serves four query types and advertises
exactly those four. They are recorded because the reason drogna serves so few is
easy to misread as timidity, and it is not: `position` and `cube` are supplied by
the `xarray-edr` provider, `trajectory` and `instances` are the two this project
exists to write, and of the five it does not serve, one cannot be reached at all
and another cannot be answered correctly by anybody.

### How a provider says what it can answer

The check at the top of the figure — is this query type advertised? — is why the
registration mechanism matters, and pygeoapi has spelt it two different ways.

<figure>
<div style="overflow-x:auto">
<svg class="edrr" viewBox="0 0 900 406" role="img" aria-labelledby="edrr-title edrr-desc" preserveAspectRatio="xMidYMid meet" style="width:100%;min-width:780px;height:auto">
<title id="edrr-title">Two mechanisms for advertising EDR query types, and their different failures</title>
<desc id="edrr-desc">Two panels side by side. Left, pygeoapi 0.20.0, the release drogna pins: BaseEDRProvider carries a class attribute query_types set to an empty list, and a decorator, at-BaseEDRProvider-dot-register, appends each decorated method's name to it. Two providers are shown below it — the supplied xarray-edr provider registering position, and another provider registering area — both appending into that same single list. Because the list belongs to the base class, every provider in the process shares it, so one collection can end up advertising a query type that a different provider registered. Right, pygeoapi 0.25.dev0, the development line the spike measured: there is no decorator; instead __init_subclass__ rebuilds query_types from the subclass's own __dict__, keeping only names that are EDR query types. A subclass that adds only a trajectory method therefore advertises exactly trajectory, and the inherited position and cube methods stop being advertised. That is not an error; the collection simply stops offering two query types its provider can still answer. Below both panels, a highlighted strip: drogna satisfies both mechanisms rather than choosing between them. Every query type it serves is a method in the class's own __dict__ and is also named in a query_types list set on the class, which shadows the base's shared one, and a test asserts both.</desc>
<style>
svg.edrr { color: var(--md-default-fg-color--light); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
svg.edrr .b { fill: var(--md-code-bg-color); stroke: var(--md-default-fg-color--lighter); stroke-width: 1; }
svg.edrr .panel { fill: var(--md-default-fg-color--lightest); stroke: var(--md-default-fg-color--lighter); stroke-width: 1; }
svg.edrr .hz { fill: var(--md-code-bg-color); stroke: var(--md-accent-fg-color); stroke-width: 2; }
svg.edrr .t { fill: var(--md-default-fg-color); font-size: 12.5px; }
svg.edrr .s { fill: var(--md-default-fg-color--light); font-size: 11px; }
svg.edrr .a { fill: var(--md-default-fg-color); font-size: 12.5px; font-weight: 600; }
svg.edrr .lbl { fill: var(--md-default-fg-color--light); font-size: 10.5px; letter-spacing: 0.09em; }
svg.edrr .m { fill: var(--md-default-fg-color); font-size: 11.5px; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
svg.edrr .ln { stroke: currentColor; stroke-width: 1.4; fill: none; }
svg.edrr #edrr-head path { fill: var(--md-default-fg-color--light); }
</style>
<defs>
<marker id="edrr-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
</defs>

<rect class="panel" x="20" y="20" width="420" height="284" rx="8"/>
<text class="lbl" x="36" y="44">PYGEOAPI 0.20.0 — THE RELEASE DROGNA PINS</text>
<rect class="b" x="36" y="56" width="388" height="58" rx="5"/>
<text class="m" x="52" y="79">class BaseEDRProvider:</text>
<text class="m" x="68" y="99">query_types = []   ← one list, on the base</text>
<line class="ln" x1="129" y1="170" x2="129" y2="118" marker-end="url(#edrr-head)"/>
<line class="ln" x1="331" y1="170" x2="331" y2="118" marker-end="url(#edrr-head)"/>
<rect class="b" x="36" y="170" width="186" height="48" rx="5"/>
<text class="t" x="129" y="192" text-anchor="middle">XarrayEDRProvider</text>
<text class="m" x="129" y="210" text-anchor="middle">@register() position</text>
<rect class="b" x="238" y="170" width="186" height="48" rx="5"/>
<text class="t" x="331" y="192" text-anchor="middle">any other provider</text>
<text class="m" x="331" y="210" text-anchor="middle">@register() area</text>
<text class="s" x="36" y="246">@BaseEDRProvider.register() appends each name to that</text>
<text class="s" x="36" y="264">one list. It belongs to the base class, so every provider</text>
<text class="s" x="36" y="282">in the process shares it and sees the others' types.</text>

<rect class="panel" x="460" y="20" width="420" height="284" rx="8"/>
<text class="lbl" x="476" y="44">PYGEOAPI 0.25.dev0 — THE LINE THE SPIKE MEASURED</text>
<rect class="b" x="476" y="56" width="388" height="78" rx="5"/>
<text class="m" x="492" y="79">def __init_subclass__(cls):</text>
<text class="m" x="508" y="99">cls.query_types = [n for n in cls.__dict__</text>
<text class="m" x="536" y="119">if n in EDR_QUERY_TYPES]</text>
<line class="ln" x1="670" y1="134" x2="670" y2="170" marker-end="url(#edrr-head)"/>
<rect class="b" x="476" y="170" width="388" height="48" rx="5"/>
<text class="t" x="670" y="192" text-anchor="middle">A subclass that adds only trajectory()</text>
<text class="s" x="670" y="210" text-anchor="middle">advertises exactly ['trajectory'].</text>
<text class="s" x="476" y="246">The inherited position and cube stop being advertised.</text>
<text class="s" x="476" y="264">Not an error: the collection simply stops offering two</text>
<text class="s" x="476" y="282">query types that its provider can still answer.</text>

<rect class="hz" x="20" y="320" width="860" height="72" rx="6"/>
<text class="a" x="450" y="344" text-anchor="middle">drogna satisfies both mechanisms rather than choosing between them.</text>
<text class="s" x="450" y="364" text-anchor="middle">Every query type it serves is a method in the class's own __dict__, and is also named in a query_types</text>
<text class="s" x="450" y="382" text-anchor="middle">list set on the class, which shadows the base's shared one. A test asserts the collection advertises all three.</text>
</svg>
</div>
<figcaption>Advertising query types: a shared mutable list on the base class in pygeoapi 0.20.0, versus a per-subclass rebuild from <code>__dict__</code> in the 0.25 development line.</figcaption>
</figure>

In 0.20.0, `BaseEDRProvider` carries `query_types = []` as a class attribute, and
a `@BaseEDRProvider.register()` decorator appends each decorated method's name to
it. The list belongs to the *base*, so every registration anywhere in the process
lands in the same list and providers see one another's types. In the 0.25
development line the decorator is gone: `__init_subclass__` rebuilds
`query_types` from the subclass's own `__dict__`, so a plugin that subclasses a
supplied provider and adds only `trajectory` advertises only trajectory, and the
inherited `position` and `cube` vanish from the collection in silence.

The two failures are different in kind. One loses capability visibly in a single
collection; the other lets one provider's registration leak into another's. The
spike measured the development line and the deployment pins 0.20.0, so drogna
honours both mechanisms rather than choosing on the strength of a measurement
made against the other. The served collection was checked live and advertises
`['cube', 'instances', 'position', 'trajectory']`.

There is a general lesson underneath, and it is the reason this section exists in
a primer at all: **a measured finding is measured against a version.** Pinning a
version other than the one measured does not merely weaken the finding — it can
replace the hazard with a different one.

## What comes back

The response format is [CoverageJSON](coveragejson.md), which separates the
**domain** (where and when the values sit) from the **ranges** (the values) and
the **parameters** (what each value means). A
[coverage](../glossary.md#coverage) is a function from positions in space and
time to values; the three query types drogna answers each produce a different
domain type.

| Query type | Domain type | Shape of the domain | Range |
|---|---|---|---|
| `position` | `Point` | Axes `x`, `y`, `z`, `t`, each with a single value. | `NdArray` of shape `[1, 1, 1, 1]` over `t, z, y, x`. |
| `cube` | `Grid` | Axes `x`, `y`, `z`, `t`, each a list of grid values. | `NdArray` over `t, z, y, x`, flat, in that declared order. |
| `trajectory` | `Trajectory` | One `composite` axis whose every entry is a `(t, x, y, z)` tuple, one per vertex. | `NdArray` of shape `[n]` over `["composite"]`. |

The composite axis is what makes the trajectory response worth having. It is a
list of rows in the order they were asked for, so the browser client receives
exactly `(t, x, y, z, value)` per vertex with no reshaping to do — the standard's
own response shape happens to be the shape the client's centrepiece needs. Not to
be confused with CF's [trajectoryProfile](../glossary.md#trajectoryprofile),
which describes data *collected* along a path rather than values requested along
one; the two meet in the query layer and nowhere else.

Every response carries a `referencing` block naming three systems: a geographic
CRS for `x` and `y`, a vertical CRS for `z`, and a temporal reference system for
`t`. The vertical one earns its place. WKT Z is elevation, positive up; the
coverage's axis is depth, positive down; drogna's provider applies `depth = -z`
and says so in the response, because a vertical axis left implicit will be read
upside down by somebody and the reading will look plausible.

Two more things a response says that a response usually does not. A vertex
falling outside the run's extent gets a null value *and* an entry under
`drogna:declined` naming the axis and the extent that excluded it — because a
null in an array is indistinguishable from a missing measurement, and this is
neither. And the provider interpolates linearly in all four dimensions rather
than snapping to the nearest stored time step, which is a choice invisible from
outside: snapping the acceptance test's route would have put a fifth of a degree
of the harness's own arithmetic into what it reports.

## What drogna implements, and what it does not

`position`, `cube`, `trajectory` and `instances`, from a single provider class
over a single collection. One collection rather than two, because two could
disagree about which run they describe.

`radius`, `area`, `corridor`, `items` and `locations` are **not** served, and the
provider does not advertise them, so they are refused with 400 before any
drogna code runs. That is a decision rather than a gap: nothing in the harness
asks those questions, and a query type claimed but untested is a claim this
repository exists not to make.

The absence on the other side is more interesting. Of the nine query types,
pygeoapi 0.20.0 supplies implementations for only some, across exactly two EDR
providers: `xarray-edr` offers `position` and `cube`, and `sensorthings-edr`
offers `items`, `locations`, `cube` and `area` — but the latter is an HTTP
*client* against an external SensorThings service, so it cannot serve a store of
our own. **No supplied provider implements `trajectory`, `corridor` or `radius`
at all.** The standard expresses the trajectory query natively and the
implementations have not caught up, which is why drogna's centrepiece query needs
a bespoke plugin rather than a configuration entry. Where a standard is ahead of
its implementations, drogna writes the adapter and records the cost: a
compatibility surface against a provider base class that carries no compatibility
promise, guarded by an exact version pin that both providers check before they
serve anything.

Two limits are worth knowing because they are stated in refusals rather than
applied by truncation. A cube is bounded by cell count. A trajectory is bounded
at 91 vertices — measured, not chosen: at six decimal places, 91 vertices is a
4,081-byte request line that works and 92 is 4,125 bytes refused by the web
server before pygeoapi sees it. There is no POST form of an EDR query; the
endpoint answers 405. The ceiling is a server setting rather than anything about
the standard, and it belongs with the limit it produces.

## The question drogna needs it to answer

Whether a standards-based read interface can serve a four-dimensional trajectory
query well enough to be the *only* read path, with no bespoke endpoint alongside
it.

The answer so far is yes, with an asterisk that is not about the standard. The
query is expressible natively, the response shape fits the client without
translation, and the measured error against a field with a closed form is
6.1 × 10⁻¹¹ °C for the acceptance test's twenty-vertex route. What it cost was a
provider that had to be written, a version pin that guards a silent failure, and
a registration mechanism honoured twice because two releases spell it
differently. None of that is visible from outside, which is the reason for
writing it down here.

## The standard itself

The authoritative document is the
[OGC API — Environmental Data Retrieval Standard](https://docs.ogc.org/is/19-086r6/19-086r6.html)
(OGC 19-086r6), with an overview and the current work at
[ogcapi.ogc.org/edr](https://ogcapi.ogc.org/edr/). This page paraphrases none of
it at length; where the two disagree, the standard is right and this page is a
bug.
