"""What it costs to get from one place to the next, in seconds of simulation time.

The budget is expressed in time rather than distance. The SRD says "under a budget" without
fixing its units (SRD FR-35), and time is the unit that makes the two axes of a
four-dimensional route commensurable: changing depth costs nothing horizontally and is not
free, so a budget in metres would price a descent at zero. Distance is still reported,
because a reader wants to know how far a recommendation reaches, but consumption is
measured in seconds and the budget binds on seconds.

The two speeds are configuration and are nominal. The planner is not modelling a platform —
a sampling platform in drogna is a coordinate and a sampler (Constitution V) — it is
pricing a route so that a budget means something. A more careful cost model would change
these two numbers into a function and change nothing else in this package.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclass_field

from harness_types.messages.plan import Platform

from harness_planner.cells import CellGeometry, PlanningCell

__all__ = ["Position", "TraversalCost"]

_MICROS_PER_SECOND = 1_000_000

Position = Platform
"""Where the sampling platform is: a coordinate and a depth, and nothing else.

This is the plan contract's own ``platform`` shape, imported rather than written out again
(Constitution III). It is aliased because in this module the same three numbers are a point
on a route as often as they are the platform, and a reader following ``position_of`` should
not have to wonder whether a second platform has appeared. It is the generated model either
way, not a second declaration of it.
"""


@dataclass(frozen=True)
class TraversalCost:
    """Nominal speeds, and the geometry the distances are measured on."""

    geometry: CellGeometry
    horizontal_speed_m_per_s: float
    vertical_speed_m_per_s: float
    _positions: dict[PlanningCell, Position] = dataclass_field(
        default_factory=dict, repr=False, compare=False
    )

    def __post_init__(self) -> None:
        if self.horizontal_speed_m_per_s <= 0 or self.vertical_speed_m_per_s <= 0:
            raise ValueError("a nominal speed is positive; a stationary platform has no budget")
        object.__setattr__(self, "_positions", {})

    def position_of(self, cell: PlanningCell) -> Position:
        """The centre of a planning cell, as a position.

        Cached, because a search asks for the same cell's position thousands of times and an
        H3 centre lookup inside the innermost loop of an insertion is the cost of the search
        rather than a detail of it.
        """
        cached = self._positions.get(cell)
        if cached is None:
            latitude, longitude, depth_m = self.geometry.centre(cell)
            cached = Position(latitude=latitude, longitude=longitude, depth_m=depth_m)
            self._positions[cell] = cached
        return cached

    def distance_m(self, origin: Position, target: Position) -> float:
        """Great-circle distance between two positions, horizontal only, in metres."""
        return self.geometry.distance_between(
            (origin.latitude, origin.longitude), (target.latitude, target.longitude)
        )

    def seconds(self, origin: Position, target: Position) -> float:
        """How long the leg takes at the nominal speeds.

        Horizontal and vertical are added rather than taken in parallel. A platform that
        descended while transiting would be a platform model, and this component has no
        business holding one; adding them is the conservative reading of a budget, which is
        the right way for a recommendation to be wrong if it must be wrong.
        """
        horizontal = self.distance_m(origin, target) / self.horizontal_speed_m_per_s
        vertical = abs(target.depth_m - origin.depth_m) / self.vertical_speed_m_per_s
        return horizontal + vertical

    def micros(self, origin: Position, target: Position) -> int:
        """The same leg, in whole microseconds of simulation time.

        Rounded here and nowhere else. Simulation instants are exact integer microseconds,
        and an arrival computed by accumulating floating-point seconds would drift from the
        instants the recommendation publishes.
        """
        return round(self.seconds(origin, target) * _MICROS_PER_SECOND)
