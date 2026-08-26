"""C-09's harness-authored parts: two pygeoapi provider plugins and what they rest on.

pygeoapi is the query layer. What it does not supply, drogna writes here:

- an EDR provider serving position, cube and trajectory queries over the coverage store,
  because no supplied provider implements trajectory at all (FR-050, ADR-0003);
- a SensorThings Part 1 Sensing provider serving a stated subset read-only from the
  observation store, because pygeoapi's supplied ``sensorthings`` provider is an HTTP
  client that consumes an external SensorThings service (FR-009, ADR-0004);
- the catalogue that resolves runs from the coverage store's layout at request time, so a
  new run becomes servable without a configuration edit (FR-021).

Both providers share one pygeoapi version pin, in :mod:`plugins.pygeoapi_version`, and both
refuse to serve against a version they have not been tested against.

The modules divide along one line, and it is worth stating because it is what makes the
package testable. Everything that computes — the catalogue, the reader, the interpolation,
the CoverageJSON assembly, the entity projection, the query options — is plain Python that
imports nothing from pygeoapi. Only :mod:`plugins.edr_coverage`,
:mod:`plugins.edr_trajectory` and :mod:`plugins.sensorthings_provider` touch the framework,
and they touch it thinly: a base class, a constructor and an error type.
"""

from __future__ import annotations

__all__: list[str] = []
