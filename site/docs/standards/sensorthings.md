---
title: SensorThings
---

# SensorThings

A temperature reading is four numbers and a headache. The numbers are easy — a
value, a place, a depth, a moment. The headache is everything the value needs
around it before anybody else can use it: what was measured, what measured it,
what it was measured *on*, in what unit, and how sure the instrument was. Get
those wrong and you have a database of floats that nobody outside the team that
wrote it can safely read.

OGC SensorThings API Part 1 (Sensing) is a standard answer to that. It fixes an
entity model for observations and their metadata, and a web interface for reading
them. drogna adopts its vocabulary at the *source* — a simulated sensor publishes
in SensorThings terms, the store persists those terms, and the
[query layer](../archive/subsystems/c09-query-layer.md) serves them out again — so there
is one data dictionary rather than three.

This page is a primer for a reader who has not met the standard, and then a plain
statement of the subset drogna implements. **drogna's interface is not conformant
and does not claim to be.** The authoritative account of the subset lives beside
the code, in `query/conformance.md`, and is generated from the same constants the
implementation enforces; this page is carried from it, and a test compares the
two so they cannot drift apart. Where they disagree, that document is right.

## The entity model

Seven entity types, and a reader who understands why one instrument produces
several [datastreams](../glossary.md#datastream) understands most of the standard.

| Entity | What it is |
|---|---|
| **Thing** | The object of interest that carries sensors. In drogna, the sampling platform. |
| **Sensor** | The instrument. A description of the device and how it encodes its output. |
| **ObservedProperty** | The phenomenon being measured — "sea water temperature" — independent of what measures it. |
| **Datastream** | The join: observations of *one* observed property, by *one* sensor, on *one* Thing, in *one* unit. |
| **Observation** | A single value, with the instant it pertains to. |
| **FeatureOfInterest** | The thing the observation is *about* — here, the place in the water the value describes. |
| **Location** | Where a Thing is. drogna serves none; see below. |

### Why the Datastream is the interesting one

The four-way join is the standard's central idea and the one newcomers most often
skip past. A [CTD](../glossary.md#ctd) does not produce *a* datastream. It
produces three or four — one for temperature, one for salinity, one for pressure —
because each measures a different observed property in a different unit.

That has a direct consequence for how you ask questions. "What did this instrument
record?" is a query *across* datastreams. "What is the temperature history here?"
is a query *within* one. drogna's simulated platform carries exactly this shape:
`ds-temperature`, `ds-salinity` and `ds-pressure`, each with its own sensor
description, its own [observed property](../glossary.md#observed-property) and its
own noise model.

### Observation versus FeatureOfInterest

This is the distinction most often collapsed, and collapsing it is how a data
model loses the ability to say where anything was.

An **Observation** is the act and the result: this value, at this moment, on this
datastream. A **FeatureOfInterest** is what the observation is *about* — the patch
of water whose temperature this is. They are separate because they vary
independently: many observations can concern one feature of interest, and one
observation always concerns exactly one.

In drogna the feature of interest is the position in the water column that the
value describes. That is the entity that carries the geometry, which matters for
the next section.

### Where the unit lives

On the **Datastream**, once, and not on each Observation. An observation is a bare
number and a time.

This is a real design choice with a real consequence. It is efficient and it is
unambiguous within a datastream — but anything that mixes datastreams has to carry
the unit along from the datastream, because the observations themselves no longer
know. A consumer that pools observations from several datastreams and forgets to
carry the units has built a bug that no individual record is wrong enough to
reveal.

## What drogna serves

Six entity sets:

```text
Things   Sensors   ObservedProperties   Datastreams   Observations   FeaturesOfInterest
```

Each is addressable as a resource and each entity is addressable by its own
identifier. Every entity carries a self link and one navigation link per
relationship it has, so the whole set can be walked from the service root without
any prior knowledge of the path grammar.

The served datastreams are temperature, salinity and pressure. There is
deliberately **no sound-speed datastream**: [sound speed](../glossary.md#sound-speed)
is derived at the point of use by one shared implementation and is never published
or stored, so that there is exactly one definition of it in the system.

### The path grammar

```text
/<EntitySet>
/<EntitySet>(<id>)
/<EntitySet>(<id>)/<NavigationProperty>
```

One navigation step. A deeper path is refused with the grammar named rather than
half-answered. Those paths hang off the collection's item path, because the entity
set is served by a pygeoapi provider plugin and a provider plugin cannot add
routes of its own:

```text
<base>/collections/observations/items/Datastreams('ds-temperature')/Observations
```

An `.../items` request with no entity set after it is an OGC API - Features
resource, and this collection has no features. It answers with an empty feature
collection carrying the non-conformance statement and the list of entity sets
beside it, so a consumer starting there is pointed at the entity sets rather than
at an error.

## What drogna does not serve, and why

### Two entity sets are absent by decision

**`Locations`** and **`HistoricalLocations`** are not served, and their absence is
a decision rather than an oversight.

The store holds the location each observation pertains to, and serves it as that
observation's FeatureOfInterest. What it does not hold is a Thing's location
history. Constitution V forbids the harness to hold anything of that shape, and
`HistoricalLocations` is the standard's own name for exactly it. Stating the
reason matters as much as stating the absence: an unexplained gap reads as
something nobody got round to.

### Query options

Six are implemented:

| Option | What drogna does with it |
|---|---|
| `$top` | Page size, bounded by a configured maximum. |
| `$skip` | Page offset. A full page carries a next link; a short page does not, because a next link on a short page invites a round trip that returns nothing. |
| `$count` | The total, without retrieving every page. |
| `$orderby` | On `phenomenonTime` only, ascending or descending. |
| `$filter` | Comparisons on `phenomenonTime` only, joined by `and`. |
| `$expand` | One level: a Datastream to its Sensor, ObservedProperty and Thing; an Observation to its Datastream and FeatureOfInterest. |

`phenomenonTime` is **simulation time**, and it is the only property that can be
filtered or ordered on. No arrival time and no insertion time is exposed at all. A
consumer able to filter on when a row was written could reconstruct the order the
harness happened to write it in, which is not a fact about the simulated world.

Everything else is out of scope **by decision**, and a request using one is
refused with the option named and the conformance statement pointed at. None is
ignored and none is answered as though it had been applied — a silently dropped
query option returns an answer to a question nobody asked, and it looks exactly
like a correct one.

- `$select`, `$search`, `$apply`, `$value` and `$ref` — nothing here needs a
  partial projection, a free-text search, an aggregation, a raw property value or
  a link-only representation.
- Nested `$expand`, and query options inside an `$expand` — expansion is to a
  single level; the expanded set is returned whole, bounded by the page size.
- `$filter` on any property other than `phenomenonTime`, including spatial
  predicates and result values, and the filter language's geospatial and temporal
  functions. Every read of this store is a read over simulation time.
- Every **write** operation, and deep insert. The query layer holds select
  permission on the observation store and nothing more.
- **Part 2 (Tasking)**. Out of scope, and worth stating loudly rather than
  quietly: a system that emits sampling recommendations and also speaks a tasking
  protocol has quietly crossed from recommending into commanding, which is a line
  this harness defends.
- The Part 1 **MQTT** subscription extension. This is the confusion most likely to
  arise here, because the harness *does* run a broker and *does* publish
  observations in SensorThings vocabulary on it. That broker is not a SensorThings
  endpoint, and subscribing to it is not this standard.

## Why the interface is bespoke at all

pygeoapi ships a provider named `sensorthings`, and it is the wrong direction.
That provider is an HTTP *client*: it queries an external SensorThings service,
transforms the entities it receives and republishes them as OGC API - Features. It
consumes the standard rather than providing it. drogna has a Postgres observation
store and no external service to point it at, so the entity set is projected here
instead, read-only, from the observations schema.

Where a standard is ahead of its implementations, drogna writes the adapter and
states plainly which subset it actually implements. That is the same pattern as
the bespoke [trajectory](../glossary.md#trajectory) provider on the
[EDR](ogc-api-edr.md) side, and it is the reason both are recorded as decisions
rather than as workarounds.

## The counter-argument, stated fairly

Adopting a standard's vocabulary internally is not a free win, and this page would
be dishonest not to say so.

It couples internal shapes to an external specification. Every entity name, every
relationship and every field name in drogna's observation path is now something
somebody else controls. If the standard revises, or if a scenario needs a concept
the standard has no room for, the cost lands inside the system rather than at its
edge. The usual alternative — an internal model of your own, translated to the
standard at the read boundary — keeps that freedom, and is what most systems do.

drogna takes the other side because of what a translation step costs. Every
translation is a place where the unit, the quality flag or the observed property
can be silently dropped, and those places are exactly where a data dictionary goes
to die. The whole value of adopting the standard at the source is removing them.
It is a bet, and the question below is how it is settled.

## The question drogna needs it to answer

Can a single vocabulary carry an observation unchanged from publication to query
response, with no translation step at either the store or the read boundary?

## The standard itself

The authoritative document is the
[OGC SensorThings API Part 1: Sensing](https://docs.ogc.org/is/18-088/18-088.html)
(OGC 18-088). This page paraphrases none of it at length. For what drogna
implements, `query/conformance.md` in the repository is the normative statement
and this page is carried from it.
