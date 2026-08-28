# ADR-0025: The SensorThings filter subset grows exactly one spatial predicate

**Status:** Accepted
**Date:** 28 August 2026
**Requirements:** SRD FR-80 (§5.13); feature 023 FR-009; feature 008's FR-028 to FR-030 discipline; PR-03
**Raised by:** feature 023's specification, which owes this record in as many words: "spatial predicates enter a subset whose honesty has been its narrowness"

## Context

The EDR composer lets an operator draw a geometry on the map and ask the observations
the question the drawn shape describes. The forecast side of that question is answered
by the EDR provider's new area and radius types; the observation side has to be answered
by the SensorThings collection, whose filter subset — chosen from what the client and
the acceptance tests actually exercise, not from what the standard offers — implemented
comparisons on `phenomenonTime` and nothing else. Every other option is refused with the
option named, and the conformance statement enumerates the absences with their reasons.
That narrowness is the subset's honesty, and it is the thing this widening must not
spend.

The out-of-scope list itself recorded the old boundary's reason: a filter on a geometry
was "a query the harness has no use for and would have to be tested to claim". Feature
023 is the use arriving. The question is how the drawn geometry selects observations.

## Decision

**The filter subset implements exactly one spatial predicate:**

```text
$filter=st_within(location, geography'POLYGON (…)') [and phenomenonTime <op> <value> …]
```

- `location` is the observation's own sampled position — the column the ingest client
  derives the `FeatureOfInterest` from, so the two cannot disagree. No other property
  takes a spatial predicate; `st_within` on anything else is refused naming the
  property.
- The geometry is a **single-ring polygon**. Holes, multipolygons, points, and every
  other geometry are refused naming the shape: answering a different region than the
  one drawn would look exactly like a correct answer.
- The predicate composes with the existing temporal comparisons by `and`, so a drawn
  geometry and a time window select together, server-side. Disjunction remains refused.
- Every other spatial or temporal function of the filter language — `st_intersects`,
  `geo.distance`, and the rest — keeps its refusal with the function named.
- Both row sources answer the predicate from the same parse: the request's WKT literal
  is bound as a parameter into `ST_Within(location::geometry, ST_GeomFromText(%s, 4326))`
  against Postgres, and the in-memory source reads the parsed ring through the same
  ring-membership test the EDR area query uses, so the two cannot come to disagree about
  what "within" means.
- The conformance statement — served, documented in `query/conformance.md`, and carried
  into the standards primer — is amended in the same commit as the code, and the
  agreement between the accounts remains a test.

## Alternatives rejected

**Client-side selection after a temporal query.** The composer would fetch by time
window and discard observations outside the drawn geometry in the browser. Rejected:
the drawn geometry would not genuinely filter — the server would answer a question
nobody asked and the client would quietly reshape it — and the page budget makes it a
lie at scale: a region holding 3 of 10,000 observations in the window would fetch pages
until it happened upon them, or silently show a subset of a subset.

**Serving observations through an EDR items or corridor-style type.** The EDR provider
already answers drawn geometries over the coverage store; observations could be forced
through the same door. Rejected: it reshapes feature data into a coverage interface it
does not fit — observations are entities with identities, links and datastreams, not
samples of a continuous field — and it would duplicate into EDR the entity model the
SensorThings subset already serves honestly.

**A wider spatial vocabulary while we are here.** `st_intersects` and `geo.distance`
have plausible uses and no present consumer. Rejected on the subset's own founding
rule: options are chosen from what is actually exercised, and every widening beyond
need is conformance surface that would have to be tested to claim. The composer's
circle is drawn client-side as a polygon and lands in the one predicate.

## Consequences

- A drawn polygon selects observations server-side, in combination with time — the
  observation half of the composer's US6 stands on a genuine filter.
- The subset's conformance statement grows its first spatial sentence, and the refusal
  discipline is unchanged: everything not in that sentence still names itself when
  refused. The gap most likely to mislead — `st_within` accepted on `location` but
  refused on `FeatureOfInterest/feature` — is covered by a refusal that names the
  property and points at the conformance statement.
- The `SelectionCriteria` shape gains a `within` tuple; anything that builds criteria
  (navigation, expansion) carries it exactly as it carries the temporal comparisons.
- A second spatial predicate, if one is ever needed, is a widening of this record, not
  an analogy to it: it must arrive with its consumer, its tests and its conformance
  amendment, as this one did.
