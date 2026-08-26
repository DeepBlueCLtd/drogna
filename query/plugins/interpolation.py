"""Getting a value between grid nodes, and refusing to invent one outside the grid.

Two decisions live here, and the spike measured both. Neither is visible from a response,
which is why they are stated rather than left to the code.

**Linear, not nearest.** A vertex time placed between two forecast steps is interpolated,
not snapped. Snapping is indistinguishable from outside and put half a degree of avoidable
error into the spike's sampled route — error that would have been reported as the harness's
recovery figure and would have been the harness's own arithmetic.

**Null outside the domain, never extrapolation.** A point beyond the last time step, below
the deepest level or outside the horizontal extent has no value, and the value reported is
null. A forecast horizon that silently extends itself is the worst failure available to
this component: it returns HTTP 200 and nothing in the response says which behaviour was
chosen.

Boundary behaviour, since a plausible-looking wrong answer here is the hardest kind to
notice:

- exactly on a grid node: the stored value, with no arithmetic between neighbours;
- exactly between two nodes: the mean of the two, which is what linear means there;
- exactly on the first or last node of an axis: inside the domain, not outside;
- on a one-element axis: that element's value, for any coordinate that equals it, and null
  for any that does not — a single time step is a domain of one instant, not of all time.
"""

from __future__ import annotations

from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass

from plugins.netcdf_reader import NetcdfVariableData

__all__ = ["Axis", "Grid", "interpolate"]


@dataclass(frozen=True)
class Axis:
    """One monotonically increasing coordinate axis and the arithmetic done along it."""

    name: str
    values: tuple[float, ...]

    def __post_init__(self) -> None:
        if not self.values:
            raise ValueError(f"axis {self.name!r} has no values")
        increasing = all(a < b for a, b in zip(self.values, self.values[1:], strict=False))
        if not increasing:
            raise ValueError(
                f"axis {self.name!r} is not strictly increasing; the reader does not "
                f"reorder an axis, because a reordered axis and a mislabelled one look "
                f"the same from here"
            )

    @property
    def minimum(self) -> float:
        return self.values[0]

    @property
    def maximum(self) -> float:
        return self.values[-1]

    @property
    def spacing(self) -> float:
        """Nominal spacing, which is what an interpolation tolerance is derived from."""
        if len(self.values) < 2:
            return 0.0
        return (self.maximum - self.minimum) / (len(self.values) - 1)

    def contains(self, coordinate: float) -> bool:
        return self.minimum <= coordinate <= self.maximum

    def bracket(self, coordinate: float) -> tuple[int, int, float] | None:
        """``(lower, upper, weight)`` for a coordinate, or ``None`` when it is outside.

        The weight is the fraction of the way from ``lower`` to ``upper``. On a node it is
        zero and both indices are that node, so a stored value is returned unaltered.
        """
        if not self.contains(coordinate):
            return None
        if len(self.values) == 1:
            return 0, 0, 0.0
        position = bisect_left(self.values, coordinate)
        if position < len(self.values) and self.values[position] == coordinate:
            return position, position, 0.0
        lower = position - 1
        upper = position
        span = self.values[upper] - self.values[lower]
        return lower, upper, (coordinate - self.values[lower]) / span


@dataclass(frozen=True)
class Grid:
    """The four axes a coverage variable is defined on, in the order they are stored."""

    time: Axis
    depth: Axis
    latitude: Axis
    longitude: Axis

    @property
    def axes(self) -> tuple[Axis, Axis, Axis, Axis]:
        return (self.time, self.depth, self.latitude, self.longitude)

    def contains(self, coordinate: Sequence[float]) -> bool:
        return all(axis.contains(value) for axis, value in zip(self.axes, coordinate, strict=True))

    def outside(self, coordinate: Sequence[float]) -> list[str]:
        """Which axes a coordinate falls outside, so a refusal can name the extent."""
        return [
            f"{axis.name} {value!r} is outside [{axis.minimum}, {axis.maximum}]"
            for axis, value in zip(self.axes, coordinate, strict=True)
            if not axis.contains(value)
        ]


def interpolate(
    variable: NetcdfVariableData,
    grid: Grid,
    coordinate: Sequence[float],
) -> float | None:
    """The value at ``(time, depth, latitude, longitude)``, or ``None`` outside the domain.

    Quadrilinear: the sixteen surrounding nodes, weighted. Where the coordinate sits on a
    node in some axes the bracket collapses there and those nodes coincide, so the sum is
    still exactly the stored value and no arithmetic is done that need not be.
    """
    brackets: list[tuple[int, int, float]] = []
    for axis, value in zip(grid.axes, coordinate, strict=True):
        bracket = axis.bracket(value)
        if bracket is None:
            return None
        brackets.append(bracket)

    total = 0.0
    for corner in range(16):
        weight = 1.0
        index: list[int] = []
        for axis_position, (lower, upper, fraction) in enumerate(brackets):
            if corner >> axis_position & 1:
                if lower == upper:
                    weight = 0.0
                    break
                weight *= fraction
                index.append(upper)
            else:
                weight *= 1.0 if lower == upper else 1.0 - fraction
                index.append(lower)
        if weight == 0.0:
            continue
        total += weight * variable.at(index)
    return total
