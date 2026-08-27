"""The ensemble: one derived stream per member, the mean, and the spread that is the point.

SRD FR-29 asks for a small ensemble with perturbed initial conditions, and FR-07 asks for an
uncertainty field. This module is where the second comes out of the first. Each member gets
its own derived generator — ``model_runner.member.<ordinal>`` — so a member's realisation is
a function of the root seed and its ordinal and of nothing else, and two runs from one
manifest produce identical fields (SC-010).

The uncertainty field is the per-cell spread across members **and nothing else**. It is not
combined with observation age here: the planner (feature 011) holds that combination,
because it is the only consumer that needs it and because doing it here would make the
runner depend on an observation stream it does not otherwise read (FR-020).

A member that fails invalidates the whole run. A spread computed over the members that
happened to finish is a different quantity from the spread that was asked for, and
publishing it under the same name would be a quiet lie — so the run is marked failed and
nothing is offered for publication.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from harness_core.rng import RandomStreams

from harness_model_runner.kernel import (
    GriddedField,
    InitialisationState,
    ModelKernel,
    SeededFeature,
)

__all__ = [
    "MEMBER_STREAM",
    "EnsembleOutcome",
    "MemberFailedError",
    "perturbed",
    "run_ensemble",
]

MEMBER_STREAM = "model_runner.member"
"""The stream family members draw from.

A run passes its own identifier as the prefix, so a member's realisation is a function of
the root seed, the run's name and the member's ordinal — and of nothing else, the number of
runs that happened to precede it included. Without that, re-running one run after a restart
would draw further along a shared sequence and produce a different field for the same
request, which is a replay claim that quietly is not one.
"""


class MemberFailedError(RuntimeError):
    """A member did not complete, so the run has no spread worth publishing."""


@dataclass(frozen=True)
class EnsembleOutcome:
    """The mean field, the per-cell spread, and how many members produced them."""

    mean: GriddedField
    temperature_spread_c: Sequence[float]
    salinity_spread_psu: Sequence[float]
    member_count: int


def perturbed(
    state: InitialisationState,
    randomness: RandomStreams,
    ordinal: int,
    *,
    temperature_c: float,
    salinity_psu: float,
    drift_fraction: float,
    stream_prefix: str = MEMBER_STREAM,
) -> InitialisationState:
    """One member's initial conditions: the state, displaced by its own draws.

    The background is displaced, and each feature's drift velocity is scaled, which is what
    makes the members disagree more where a feature is moving than in quiet water. That is
    the property the planner reads: spread is large where the model is least sure.
    """
    generator = randomness.rng_for(f"{stream_prefix}.{ordinal}")
    temperature_offset = generator.gauss(0.0, temperature_c) if temperature_c > 0 else 0.0
    salinity_offset = generator.gauss(0.0, salinity_psu) if salinity_psu > 0 else 0.0
    background = state.background
    displaced = type(background)(
        surface_temperature_c=background.surface_temperature_c + temperature_offset,
        deep_temperature_c=background.deep_temperature_c + temperature_offset,
        temperature_scale_depth_m=background.temperature_scale_depth_m,
        surface_salinity_psu=background.surface_salinity_psu + salinity_offset,
        deep_salinity_psu=background.deep_salinity_psu + salinity_offset,
        salinity_scale_depth_m=background.salinity_scale_depth_m,
    )
    features = tuple(
        _perturb_feature(feature, generator.gauss(0.0, drift_fraction) if drift_fraction else 0.0)
        for feature in state.features
    )
    return InitialisationState(
        grid=state.grid,
        background=displaced,
        features=features,
        initialisation_micros=state.initialisation_micros,
        noise_temperature_c=state.noise_temperature_c,
        noise_salinity_psu=state.noise_salinity_psu,
    )


def _perturb_feature(feature: SeededFeature, share: float) -> SeededFeature:
    scale = 1.0 + share
    return SeededFeature(
        identifier=feature.identifier,
        shape=feature.shape,
        latitude=feature.latitude,
        longitude=feature.longitude,
        radius_km=feature.radius_km,
        temperature_amplitude_c=feature.temperature_amplitude_c,
        salinity_amplitude_psu=feature.salinity_amplitude_psu,
        depth_centre_m=feature.depth_centre_m,
        depth_half_thickness_m=feature.depth_half_thickness_m,
        east_km_per_day=feature.east_km_per_day * scale,
        north_km_per_day=feature.north_km_per_day * scale,
        reference_latitude=feature.reference_latitude,
        bearing_degrees=feature.bearing_degrees,
    )


def run_ensemble(
    kernel: ModelKernel,
    state: InitialisationState,
    randomness: RandomStreams,
    *,
    size: int,
    temperature_c: float,
    salinity_psu: float,
    drift_fraction: float,
    stream_prefix: str = MEMBER_STREAM,
) -> EnsembleOutcome:
    """Execute every member, then reduce to the mean and the spread.

    Members are executed in ordinal order and each draws only from its own stream, so the
    result does not depend on the order they happen to finish in — which is what lets this
    become concurrent later without becoming irreproducible.
    """
    if size < 2:
        raise ValueError("an ensemble of one has no spread; ask for at least two members")

    members: list[GriddedField] = []
    for ordinal in range(size):
        conditions = perturbed(
            state,
            randomness,
            ordinal,
            temperature_c=temperature_c,
            salinity_psu=salinity_psu,
            drift_fraction=drift_fraction,
            stream_prefix=stream_prefix,
        )
        generator = randomness.rng_for(f"{stream_prefix}.{ordinal}.noise")
        try:
            field = kernel.forecast(conditions, generator)
        except Exception as exc:  # any failure of any member invalidates the run, by design
            raise MemberFailedError(
                f"member {ordinal} of {size} did not complete ({exc}); a spread over a "
                "subset of the members is not the quantity that was asked for, so the run "
                "is failed rather than published"
            ) from exc
        members.append(field)

    mean_temperature = _mean(member.temperature_c for member in members)
    mean_salinity = _mean(member.salinity_psu for member in members)
    return EnsembleOutcome(
        mean=GriddedField(
            grid=state.grid, temperature_c=mean_temperature, salinity_psu=mean_salinity
        ),
        temperature_spread_c=_spread(
            (member.temperature_c for member in members), mean_temperature
        ),
        salinity_spread_psu=_spread((member.salinity_psu for member in members), mean_salinity),
        member_count=size,
    )


def _mean(arrays: object) -> list[float]:
    collected = [list(array) for array in arrays]  # type: ignore[union-attr]
    count = len(collected)
    return [sum(values) / count for values in zip(*collected, strict=True)]


def _spread(arrays: object, mean: Sequence[float]) -> list[float]:
    """Per-cell standard deviation across the members, about their own mean.

    The population form rather than the sample form: the members *are* the population here,
    and there is no wider set of members this ensemble is a sample of.
    """
    collected = [list(array) for array in arrays]  # type: ignore[union-attr]
    count = len(collected)
    return [
        math.sqrt(sum((value - centre) ** 2 for value in values) / count)
        for values, centre in zip(zip(*collected, strict=True), mean, strict=True)
    ]
