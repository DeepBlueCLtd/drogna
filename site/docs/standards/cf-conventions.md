---
title: CF conventions
---

# CF conventions

!!! warning "Stub — this primer is not written"
    The [coverage store](../subsystems/c08-coverage-store.md) and the
    [offload packager](../subsystems/c17-offload-packager.md) do not exist yet.
    This page records what the primer will cover.

The Climate and Forecast conventions are a set of rules for what goes inside a
NetCDF file so that a reader who did not write it can understand it. NetCDF
gives you arrays with names and attributes; CF tells you which attributes to
write, and what they must mean, so that the file describes itself.

drogna stores its forecast and uncertainty fields as CF-conforming NetCDF and
exports the same way.

## What the primer will cover

- **Why a self-describing file is worth the discipline.** A file whose meaning
  depends on documentation held somewhere else is a file that will eventually be
  misread. CF is the mechanism by which units, coordinate definitions and
  variable meanings travel with the data.
- **Standard names**, and the fact that they are a controlled vocabulary rather
  than free text — including the awkwardness that arises when the quantity you
  have does not have a standard name.
- **Coordinate variables, the vertical axis, and time.** The time axis is the
  one that catches people: a CF time coordinate is a number plus a units string
  giving the epoch, which means the epoch is data rather than convention.
- **Cell methods and bounds**, which express whether a value is an instantaneous
  sample or a mean over an interval — a distinction that is invisible in the
  numbers and decisive in their interpretation.
- **[Discrete sampling geometries](../glossary.md#discrete-sampling-geometry)**,
  for the data that is not a grid: points, profiles, trajectories, and the
  [trajectoryProfile](../glossary.md#trajectoryprofile) type that matches a
  vessel profiling as it moves.
- **Global attributes as a leakage surface.** Provenance attributes are the
  natural place for paths, usernames and software versions to accumulate, which
  is why drogna tests exported files rather than reviewing them by eye.

## The question drogna needs it to answer

Whether an exported file can be handed to someone with no knowledge of the
system that produced it and be read correctly, using ordinary tools, with no
accompanying explanation. That is the only test of self-description that means
anything.
