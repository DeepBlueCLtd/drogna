"""A feature with a recorded drift ends up where the drift says, to the grid's resolution.

FR-018 and the specification's third user story: advect the seeded features forward
analytically using the drift parameters the ground-truth manifest recorded. The test is the
one that matters — where is the feature now? — and it is asked of the field rather than of
the arithmetic, so that a kernel which computed the right displacement and then failed to
use it would still fail.
"""

from __future__ import annotations

from harness_core.rng import RandomStreams
from harness_model_runner.analytic_kernel import AnalyticKernel, advected_centre
from harness_model_runner.kernel import InitialisationState, SeededFeature
from harness_model_runner.truth import background_from, features_from, grid_for
from runner_support import ground_truth

ROOT_SEED = 20260826

DAY_SECONDS = 86_400.0
KM_PER_DEGREE = 111.195


def moving_feature(features: tuple[SeededFeature, ...]) -> SeededFeature:
    return next(feature for feature in features if feature.identifier == "moving_a")


def test_a_centre_is_displaced_by_velocity_times_elapsed_time() -> None:
    document = ground_truth(drift_east_km_per_day=24.0, drift_north_km_per_day=12.0)
    feature = moving_feature(features_from(document))

    latitude, longitude = advected_centre(feature, DAY_SECONDS)

    assert abs((latitude - feature.latitude) * KM_PER_DEGREE - 12.0) < 0.01
    eastward_km = (longitude - feature.longitude) * KM_PER_DEGREE * 0.656  # cos(49 degrees)
    assert abs(eastward_km - 24.0) < 0.3


def test_a_feature_that_does_not_drift_does_not_move() -> None:
    document = ground_truth()
    eddy = next(feature for feature in features_from(document) if feature.identifier == "eddy_a")

    assert advected_centre(eddy, DAY_SECONDS * 10) == (eddy.latitude, eddy.longitude)


def test_the_warm_anomaly_moves_east_in_the_field_itself() -> None:
    """The displacement is visible in the field, within one grid cell of where it should be."""
    document = ground_truth(
        drift_east_km_per_day=24.0, longitude_count=21, latitude_count=3, depth_count=3
    )
    features = features_from(document)
    grid = grid_for(document, initialisation_micros=0, step_seconds=86_400.0, steps=2)
    state = InitialisationState(
        grid=grid,
        background=background_from(document),
        features=tuple(feature for feature in features if feature.identifier == "moving_a"),
        initialisation_micros=0,
    )

    field = AnalyticKernel().forecast(state, RandomStreams(ROOT_SEED).rng_for("test.kernel"))

    depth_index = 1
    latitude_index = 1
    warmest = []
    for time_index in range(2):
        column = [
            field.temperature_c[grid.offset(time_index, depth_index, latitude_index, longitude)]
            for longitude in range(len(grid.longitudes))
        ]
        warmest.append(column.index(max(column)))

    expected = advected_centre(moving_feature(features), DAY_SECONDS)[1]
    spacing = grid.longitudes[1] - grid.longitudes[0]

    assert warmest[1] > warmest[0], "the warm core did not move east"
    assert abs(grid.longitudes[warmest[1]] - expected) <= spacing
