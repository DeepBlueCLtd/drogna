---
title: CoverageJSON
---

# CoverageJSON

!!! warning "Stub — this primer is not written"
    The [query layer](../subsystems/c09-query-layer.md) and the
    [browser client](../subsystems/c18-browser-client.md) do not exist yet. This
    page records what the primer will cover.

Read this one first. It starts with the idea the other three primers assume.

## A coverage, before any encoding

A [coverage](../glossary.md#coverage) is a function from positions in space and
time to values. That is the entire concept. It is worth stating in that abstract
form because it is what allows one data model to describe a satellite image, a
vertical profile, a model output grid, and a set of readings taken along a
ship's track — objects that look nothing like each other and answer the same
question: *what is the value here, at this moment?*

Once that idea is in place, an encoding of a coverage has to carry three things,
and the primer's structure follows them:

- **The domain** — where and when the values sit. Grid, points, trajectory.
- **The ranges** — the values themselves, as flat arrays with a declared axis
  order.
- **The parameters** — what each value *means*: its observed property, its unit,
  its categories if it has any.

Separating the parameters from the ranges is the choice that lets a client render
a field it has never seen before, because the meaning arrives with the data
rather than being compiled into the client.

## What the primer will cover

- The three parts above, with a small worked example of each.
- **The trajectory domain**, whose composite axis is a per-vertex (t, x, y, z)
  tuple — exactly the shape of "conditions along a route at the moment of arrival
  at each point", and the reason drogna's centrepiece query has a natural
  response format.
- **Why JSON and not NetCDF at this boundary.** A browser can read this without a
  translation layer. NetCDF at the same boundary requires one, and a translation
  layer is a place for meaning to go missing.
- **Where it is awkward.** Range arrays are flat, axis order is declared rather
  than structural, and a large coverage in JSON is a large amount of JSON. The
  primer will say so rather than selling the format.

## The question drogna needs it to answer

Whether the response to a trajectory query can be rendered by the client without
any drogna-specific knowledge of what the fields are — that is, whether the
data-to-viewer contract really is carried by the standard rather than by a shared
assumption between two components that happen to have the same author.
