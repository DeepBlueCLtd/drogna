---
title: Standards primers
---

# Standards primers

drogna leans on four standards, and the reason it leans on them rather than
inventing message shapes is the point of the exercise: the architecture under
test is one in which reads are served *only* through standards-based interfaces.
If the standards do not fit, that is the finding.

!!! warning "All four primers are stubs"

    None of them is written yet. Each page states what it will cover and, more
    usefully, the specific question drogna needs that standard to answer.

| Primer | What drogna uses it for | Status |
|---|---|---|
| [SensorThings](sensorthings.md) | The observation vocabulary, from sensor to query | Stub |
| [OGC API-EDR](ogc-api-edr.md) | Reads against the coverage store, including trajectory | Stub |
| [CF conventions](cf-conventions.md) | Coverage storage and offload export | Stub |
| [CoverageJSON](coveragejson.md) | The response the browser client renders | Stub |

These are primers, not specifications. Each is written for a reader who has not
met the standard, and each links to the authoritative document rather than
paraphrasing it at length.

The one to read first is [CoverageJSON](coveragejson.md), because it starts by
explaining what a [coverage](../glossary.md#coverage) is. The idea — a function
from positions in space and time to values — is the one that makes the other
three easier to follow.
