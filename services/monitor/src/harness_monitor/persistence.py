"""Persistence: what separates a divergence from a spike.

This module is the feature. A monitor that raises a run the first time a residual crosses
its threshold is a monitor that spends compute on noise, and over-sensitivity is the
failure C-11 owns (SRD §4). So a threshold crossing is evidence and nothing more, and a
divergence needs evidence that has persisted in one of two ways (FR-24):

- **spatially** — a configured number of distinct samples above threshold within a
  configured neighbourhood radius, which is what a real disagreement over a body of water
  looks like;
- **temporally** — a configured number of *consecutive* samples above threshold spanning at
  least a configured simulation-time span, which is what a real disagreement at one place
  looks like as the platform sits over it.

Consecutive means consecutive: a single scored sample below threshold ends the streak. That
one rule is what makes an isolated spike, however large, raise nothing at all — it cannot
build a streak, and alone it cannot fill a neighbourhood.

Two things invalidate accumulated evidence outright, because in both cases the evidence is
about a state of affairs that no longer exists (FR-23, FR-24):

- a new forecast being published, since residuals scored against a superseded field say
  nothing about the current one;
- a broker reconnection, since the window has a hole in it and a hole is not agreement.

Nothing here reads a host clock. Spans are differences between the simulation instants the
samples carry.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from harness_monitor.residual import ResidualSample

__all__ = ["Evidence", "PersistenceRule", "PersistenceTracker", "Region", "distance_m"]

_EARTH_RADIUS_M = 6_371_000.0
_MICROS_PER_SECOND = 1_000_000
_SMALLEST_REGION_M = 1.0


class PersistenceRule(StrEnum):
    """Which rule a body of evidence satisfied. Carried on the event, not inferred."""

    SPATIAL = "spatial"
    TEMPORAL = "temporal"


@dataclass(frozen=True)
class Region:
    """Where the contributing samples were: their centroid and an enclosing radius.

    A radius rather than a cell index. Spatial indexing belongs to the planner (SRD FR-35),
    and adopting it here would couple the monitor to the planner's index for no gain.
    """

    latitude: float
    longitude: float
    radius_m: float
    shallowest_m: float
    deepest_m: float


@dataclass(frozen=True)
class Evidence:
    """The samples that jointly justify a divergence, and the rule they satisfied."""

    rule: PersistenceRule
    samples: tuple[ResidualSample, ...]
    forecast_run_id: str

    @property
    def span_micros(self) -> int:
        return self.samples[-1].sim_micros - self.samples[0].sim_micros

    @property
    def mean_signed_m_per_s(self) -> float:
        return sum(sample.signed_m_per_s for sample in self.samples) / len(self.samples)

    @property
    def peak_m_per_s(self) -> float:
        return max(sample.magnitude for sample in self.samples)

    def region(self) -> Region:
        latitude = sum(sample.latitude for sample in self.samples) / len(self.samples)
        longitude = sum(sample.longitude for sample in self.samples) / len(self.samples)
        enclosing = max(
            distance_m(latitude, longitude, sample.latitude, sample.longitude)
            for sample in self.samples
        )
        return Region(
            latitude=latitude,
            longitude=longitude,
            # A region of no extent is not a region, and a schema that admitted one would
            # invite a consumer to divide by it. One metre is the smallest honest claim.
            radius_m=max(enclosing, _SMALLEST_REGION_M),
            shallowest_m=min(sample.depth_m for sample in self.samples),
            deepest_m=max(sample.depth_m for sample in self.samples),
        )


def distance_m(
    latitude: float, longitude: float, other_latitude: float, other_longitude: float
) -> float:
    """Great-circle distance on a spherical earth, in metres.

    A sphere is enough here. The neighbourhood radius is a tuning parameter of order a few
    kilometres, and the difference between a sphere and an ellipsoid at that scale is far
    below the difference between one scenario's threshold and another's.
    """
    first = math.radians(latitude)
    second = math.radians(other_latitude)
    delta_latitude = second - first
    delta_longitude = math.radians(other_longitude - longitude)
    haversine = (
        math.sin(delta_latitude / 2) ** 2
        + math.cos(first) * math.cos(second) * math.sin(delta_longitude / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, haversine)))


class PersistenceTracker:
    """Accumulates threshold-crossing samples and reports when they amount to something."""

    def __init__(
        self,
        *,
        threshold_m_per_s: float,
        neighbourhood_radius_m: float,
        spatial_sample_count: int,
        temporal_sample_count: int,
        temporal_span_seconds: float,
        retention_micros: int,
    ) -> None:
        if threshold_m_per_s <= 0:
            raise ValueError("the threshold is a positive number of metres per second")
        if min(spatial_sample_count, temporal_sample_count) < 2:
            raise ValueError(
                "both persistence counts are at least two; one sample is a spike, and "
                "raising a run for a spike is the failure this component owns"
            )
        self._threshold = threshold_m_per_s
        self._radius = neighbourhood_radius_m
        self._spatial_count = spatial_sample_count
        self._temporal_count = temporal_sample_count
        self._temporal_span_micros = round(temporal_span_seconds * _MICROS_PER_SECOND)
        self._retention_micros = retention_micros
        self._exceeding: list[ResidualSample] = []
        self._streak: list[ResidualSample] = []
        self._forecast_run_id: str | None = None
        self._outliers = 0
        self._armed = True

    @property
    def outliers(self) -> int:
        """Samples above threshold that never became evidence. Counted, not hidden."""
        return self._outliers

    @property
    def held(self) -> int:
        return len(self._exceeding)

    @property
    def armed(self) -> bool:
        """Whether a further divergence may be raised.

        One episode raises one event. After raising, the tracker is disarmed and stays so
        until the disagreement ends — a scored sample back below threshold — or until the
        evidence is invalidated by a new publication or a reconnection. Without this a
        sustained bias would raise an event per sample for as long as it lasted, which is
        the same over-sensitivity as firing on a spike, wearing patience as a disguise.
        """
        return self._armed

    @property
    def streak(self) -> tuple[ResidualSample, ...]:
        return tuple(self._streak)

    def invalidate(self, reason: str) -> str:
        """Discard accumulated evidence. The reason is returned so a caller can record it."""
        self._outliers += len(self._exceeding)
        self._exceeding.clear()
        self._streak.clear()
        self._forecast_run_id = None
        self._armed = True
        return reason

    def observe(self, sample: ResidualSample) -> Evidence | None:
        """Take one scored sample, and report evidence if this sample completes some.

        A sample scored against a different forecast than the evidence held invalidates
        that evidence rather than joining it: the two say things about different fields.
        """
        if self._forecast_run_id is not None and sample.forecast_run_id != self._forecast_run_id:
            self.invalidate("forecast replaced")
        self._forecast_run_id = sample.forecast_run_id

        self._expire(sample.sim_micros)

        if not sample.exceeds(self._threshold):
            self._streak.clear()
            self._armed = True
            return None

        if not self._armed:
            # The episode has already been reported. Further samples above threshold are
            # more of the same statement, and repeating it would be noise.
            self._outliers += 1
            return None

        self._exceeding.append(sample)
        self._streak.append(sample)

        temporal = self._temporal_evidence()
        if temporal is not None:
            return self._raise(temporal, PersistenceRule.TEMPORAL)
        spatial = self._spatial_evidence(sample)
        if spatial is not None:
            return self._raise(spatial, PersistenceRule.SPATIAL)
        return None

    def _raise(self, samples: Sequence[ResidualSample], rule: PersistenceRule) -> Evidence:
        """Build the evidence and start again, so one episode raises one event."""
        run_id = samples[0].forecast_run_id
        evidence = Evidence(rule=rule, samples=tuple(samples), forecast_run_id=run_id)
        self._exceeding.clear()
        self._streak.clear()
        self._armed = False
        return evidence

    def _expire(self, now_micros: int) -> None:
        horizon = now_micros - self._retention_micros
        kept = [sample for sample in self._exceeding if sample.sim_micros >= horizon]
        self._outliers += len(self._exceeding) - len(kept)
        self._exceeding = kept
        self._streak = [sample for sample in self._streak if sample.sim_micros >= horizon]

    def _temporal_evidence(self) -> tuple[ResidualSample, ...] | None:
        if len(self._streak) < self._temporal_count:
            return None
        span = self._streak[-1].sim_micros - self._streak[0].sim_micros
        if span < self._temporal_span_micros:
            return None
        return tuple(self._streak)

    def _spatial_evidence(self, sample: ResidualSample) -> tuple[ResidualSample, ...] | None:
        neighbours = [
            held
            for held in self._exceeding
            if distance_m(sample.latitude, sample.longitude, held.latitude, held.longitude)
            <= self._radius
        ]
        if len(neighbours) < self._spatial_count:
            return None
        return tuple(neighbours)
