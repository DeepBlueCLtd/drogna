---
title: Glossary
---

# Glossary

Half the vocabulary in drogna is oceanographic and the rest is drawn from four
geospatial standards. None of it is assumed. This page is not a stub and is not
intended to become one: entries are written to be read by someone meeting the
term for the first time, and every documentation page links here on a term's
first appearance.

Where drogna uses a term more narrowly than the field does, the entry says so.

---

## Advection

The transport of a property by the bulk motion of the fluid carrying it. If a
patch of warm water is sitting in a current, advection is the part of its change
that is simply the current carrying it somewhere else, as opposed to the parts
caused by mixing, heating or cooling.

It is the cheapest useful thing a forecast model can do, which is why drogna's
[model runner](subsystems/c13-model-runner.md) does it and nothing more: the
seeded features are moved forward along a known velocity and noise is added. The
result is deliberately not a real forecast. It is a field that changes over time
in a way that is structured rather than random, which is all the rest of the
system needs in order to be exercised honestly.

See the [advection derivation](algorithms/advection.md).

## Coverage

A function from positions in space and time to values. That is the whole idea,
and it is worth stating in that abstract form because it is what lets a single
data model cover a satellite image, a vertical profile, a model output grid and
a set of readings along a ship's track.

The concrete forms differ — a coverage may be a regular grid, an irregular set
of points, or a path — but the question asked of all of them is the same: what
is the value here, at this moment? [CoverageJSON](#coveragejson) is one encoding
of that idea; NetCDF is another.

## CoverageJSON

A JSON encoding for [coverages](#coverage), designed for the web and readable
directly by a browser client without a translation step.

A CoverageJSON document separates three things that other formats tend to
entangle: the **domain** (where and when the values sit), the **ranges** (the
values themselves), and the **parameters** (what each value means, including its
unit and its observed property). That separation is why a client can render a
field without hard-coding what the field contains.

Its trajectory domain is the one drogna leans on: a composite axis whose every
entry is a (time, longitude, latitude, depth) tuple, which is exactly the shape
of "conditions along a planned route, at the moment of arrival at each point".

See the [CoverageJSON primer](standards/coveragejson.md).

## CTD

Conductivity, Temperature, Depth: the standard oceanographic instrument, and by
extension the standard way a vertical profile of the water column is obtained.
It is lowered through the water measuring as it descends.

Conductivity is the interesting one. It is not itself of much direct interest;
it is measured because [salinity](#salinity) can be derived from it together with
temperature and pressure. In drogna the CTD is simulated: the
[sensors](subsystems/c04-simulated-sensors.md) sample the generated field at the
vessel's position and publish readings with instrument noise and quality flags
added.

## Datastream

A [SensorThings](standards/sensorthings.md) term, and the join at the centre of
that standard's data model. A datastream is the series of observations of *one*
[observed property](#observed-property), made by *one* sensor, on *one* thing,
in *one* unit of measurement.

The consequence worth internalising is that a CTD does not produce a datastream.
It produces three or four of them — one for temperature, one for conductivity,
one for pressure — because each measures a different property. Asking "what did
this instrument record" is therefore a query across datastreams, and asking
"what is the temperature history here" is a query within one.

## Decorrelation timescale

How long a measurement stays informative. Formally, the time over which the
correlation between a measurement and the true present value decays to some
threshold; informally, how long you can keep believing what you measured an hour
ago.

It varies enormously with the water. Inside a fast-turning
[mesoscale eddy](#mesoscale-eddy) a measurement may be stale within hours; in
quiet, well-mixed water the same measurement may still be good days later.

drogna treats it as a **field**, written tau(latitude, longitude, depth, time),
rather than as a constant or as a property of a feature. The field is *authored*
per feature over a domain-wide background value and *evaluated* per location:
a location's tau is the background blended with the contribution of any feature
overlapping it, and the timescale of a moving feature advects with that feature.
Three requirements force this shape — the background water needs a timescale of
its own, a drifting feature must take its timescale with it, and the
[planner](subsystems/c15-planner.md) needs an answer at every cell it scores, not
only inside features.

## Discrete sampling geometry

The [CF conventions](standards/cf-conventions.md) term for data that is not a
grid: points, time series, vertical profiles, trajectories, and the combinations
of those. A file declares which one it holds through a `featureType` attribute,
and the convention then prescribes how the coordinate variables are laid out.

It matters because it is the difference between a file a general-purpose tool
can read and a file that needs bespoke code. Two files can hold identical
numbers, and the one that declares `featureType = "trajectoryProfile"` can be
opened, plotted and subset by software that has never heard of the project that
produced it.

## Ensemble spread

Run a model several times from slightly different starting conditions and the
runs disagree. The spread of that disagreement — the standard deviation across
members, at each point — is used as an estimate of forecast uncertainty.

The reasoning is that where small differences in the initial state produce large
differences in the outcome, the outcome is genuinely uncertain; where all members
agree, it is not. This is an estimate of one kind of uncertainty, not of all of
it: an ensemble whose members share a systematic error will agree with each other
and be confidently wrong together.

In drogna it is what fills the uncertainty field during cold arrival, when
observation age carries no information because every observation is equally
absent. See the [derivation](algorithms/ensemble-spread.md).

## Front

A boundary between two bodies of water with different properties, across which
temperature and [salinity](#salinity) change sharply over a short horizontal
distance — sometimes a few kilometres, sometimes a few hundred metres.

Fronts matter to [sound speed](#sound-speed) because sound speed depends on
temperature, and a sharp horizontal temperature gradient is a sharp horizontal
sound speed gradient. They are also the hardest thing for a sparsely sampled
system to locate: sample either side of a front and you learn there is one
somewhere in between, which may be all you can say.

One of the four features seeded into drogna's synthetic environment is a front
of known position and sharpness, recorded in the ground-truth manifest.

## H3

A way of chopping the surface of the globe into cells and giving every cell a
name. The cells are hexagons, they come in sixteen resolutions from continent-sized
down to a few square metres, and a cell's name is a short string that also encodes
which coarser cell contains it.

Hexagons are the point. On a square grid a cell has four neighbours that share an
edge and four that share only a corner, and those two kinds of neighbour are
different distances away — so any calculation in which a cell's value depends on
its neighbours has to decide what to do about the difference, and every choice is
a fudge. Every neighbour of a hexagon is the same distance away, which removes the
question.

drogna indexes the horizontal for [planning](subsystems/c15-planner.md) at H3
resolution 6 — cells of about 36 square kilometres, some 7 km corner to corner —
and indexes depth separately in bands,
because the vertical correlation structure is nothing like the horizontal one. A
[thermocline](#thermocline) can make two depths a few metres apart nearly
independent, which no horizontal index would ever say about two points 3 km apart.

## Mesoscale eddy

A rotating, coherent body of water — typically tens to a few hundred kilometres
across, persisting for weeks to months, and drifting as it turns. Mesoscale
means "medium scale" relative to ocean basins; these are the ocean's weather
systems, and they are the dominant source of variability in much of the open
ocean.

They carry their own water with them, which means an eddy has different
temperature and salinity from its surroundings, a different
[sound speed](#sound-speed) structure, and a much shorter
[decorrelation timescale](#decorrelation-timescale) than the water around it.

drogna seeds one with a known centre, radius and strength, and one of the four
acceptance criteria is that it can be recovered from the stored observations
with a *reported* error — not asserted to be recoverable, measured.

## Observed property

A [SensorThings](standards/sensorthings.md) term: the physical phenomenon being
measured, as distinct from the sensor measuring it and from the thing it is
being measured on. "Sea water temperature" is an observed property. The CTD is
the sensor. The vessel is the thing.

Keeping these three separate is what allows two different instruments measuring
the same property to be compared, and what allows a query to ask for temperature
without knowing what measured it.

## Orienteering

The route-choosing problem in which each place worth visiting carries a prize, each
leg of the journey costs something, and there is a budget. You are not required to
visit everything; you are trying to collect as much prize as the budget affords.
The name comes from the sport, and the family it belongs to is called
*prize-collecting*.

It is worth naming because of what it is *not*. The travelling-salesman problem
asks for the cheapest order in which to visit **every** stop. That is a different
question with a different answer, and asking it of a sampling problem produces long
routes that visit low-value water because the formulation obliged them to. Under an
orienteering formulation most candidates are deliberately left unvisited, and the
count of what was considered against what was chosen is what prize-collecting looks
like from outside.

drogna's [planner](subsystems/c15-planner.md) is an orienteering problem in which
the prize at a cell is the uncertainty a visit would remove, the cost is time, and
the budget is seconds. The prizes are not fixed: visiting one cell reduces the prize
at its neighbours, which is the whole difficulty. See the
[informative path planning derivation](algorithms/informative-path-planning.md).

## Persistence forecast

The forecast that says nothing changes: conditions at time t + h will be exactly
the conditions observed at time t.

It is free, it requires no model, and over short horizons in slowly varying
conditions it is remarkably hard to beat. It is therefore the reference every
real forecast is scored against. A model that does not beat persistence is not
earning its compute, whatever its absolute error looks like.

drogna's [telemetry](subsystems/c16-telemetry.md) always reports forecast skill
against persistence, and the client displays it that way, specifically so that a
model cannot look useful by being merely plausible.

## Profile

A set of measurements taken down through the water column at one horizontal
position: temperature at 5 m, 10 m, 20 m and so on, at one place, at more or less
one moment.

It is the shape of data a [CTD](#ctd) produces on a single cast, and it is the
counterpart of a [trajectory](#trajectory), which moves horizontally instead. The
distinction matters because the two answer different questions. A surface reading
tells you nothing about where the [thermocline](#thermocline) is; a profile finds it
immediately. Almost everything that makes [sound speed](#sound-speed) interesting
is a vertical structure, so a system that only samples the surface is sampling the
least informative part of the water.

In the [CF conventions](standards/cf-conventions.md) a profile is one of the
[discrete sampling geometries](#discrete-sampling-geometry), and a series of
profiles taken at successive positions along a path is a
[trajectoryProfile](#trajectoryprofile) — which is precisely what drogna's
*arrive cold, then loiter* scenario produces.

## Salinity

How much dissolved salt the water contains. In open ocean it is around 35 on the
practical salinity scale, which is defined from conductivity ratios and is
conventionally written without a unit.

It matters here for two reasons. It is one of the three quantities
[sound speed](#sound-speed) is derived from, and together with temperature it
identifies a *water mass* — which is how one body of water is distinguished from
another across a [front](#front), and how a [mesoscale eddy](#mesoscale-eddy) is
recognised as a distinct thing rather than as a warm patch.

## Sound speed

The speed at which a pressure wave travels through seawater: roughly 1450 to
1550 m/s, against about 340 m/s in air.

It increases with temperature, with [salinity](#salinity) and with pressure.
Temperature dominates in the upper ocean, which is why a
[thermocline](#thermocline) produces a sound speed minimum and why a horizontal
temperature [front](#front) is also a sound speed front.

Sound speed is not measured directly. It is computed from temperature, salinity
and pressure, and that computation is one of the few pieces of genuinely bespoke
logic inside drogna's boundary. It is also the quantity the
[monitor](subsystems/c11-monitor.md) computes its residual on — deliberately not
temperature, because a temperature residual can be large while the derived
quantity that actually matters is fine.

## Thermocline

The depth interval in which temperature falls sharply with depth, separating the
warm, wind-mixed surface layer from the cold deep water below.

It is a strong feature in [sound speed](#sound-speed) as well as in temperature,
and its depth changes with season, weather and location. A system sampling only
at the surface learns nothing about where it is; a system sampling a vertical
profile finds it immediately, which is one reason profiles are worth the effort
of collecting.

drogna seeds a thermocline at a known depth as one of its four ground-truth
features.

## Trajectory

A path through space and time: an ordered list of positions, each with the moment
it is reached. Four numbers per point — time, longitude, latitude, depth — and the
order is part of the meaning.

The word carries two related but distinct senses here, and confusing them is the
most common mistake on this material.

- **A trajectory query**, in [OGC API-EDR](standards/ogc-api-edr.md), asks *what
  will conditions be along this path, at the moment of arrival at each point*. The
  path is the question. Nothing has been measured; the answer is forecast values
  sampled along a line that may be entirely hypothetical.
- **A trajectory dataset**, in the [CF conventions](standards/cf-conventions.md),
  is data that *was collected* along a path — one of the
  [discrete sampling geometries](#discrete-sampling-geometry). The path is the
  answer.

drogna does both, and they meet in the [query layer](subsystems/c09-query-layer.md):
a trajectory query over the [coverage store](subsystems/c08-coverage-store.md)
returns a [CoverageJSON](#coveragejson) trajectory domain, whose composite axis is
one (time, longitude, latitude, depth) tuple per vertex. See the
[CoverageJSON primer](standards/coveragejson.md).

## trajectoryProfile

A [discrete sampling geometry](#discrete-sampling-geometry) defined by the
[CF conventions](standards/cf-conventions.md): a series of vertical profiles
taken at successive positions along a path.

It is the shape of the data a vessel produces when it moves and profiles as it
goes — which is precisely drogna's *arrive cold, then loiter* scenario. The
declaration matters because it tells a reader, and any CF-aware tool, that the
positions are ordered along a track rather than being an unordered scatter, and
that the depths belong to profiles rather than being another sampling dimension.

Not to be confused with EDR's **trajectory** query, which asks for values *along*
a path rather than describing data collected along one. They meet in the
[query layer](subsystems/c09-query-layer.md), where a trajectory query over the
coverage store returns a CoverageJSON trajectory domain.
