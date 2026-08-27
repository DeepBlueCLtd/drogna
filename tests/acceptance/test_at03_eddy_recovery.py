"""AT-03: the seeded eddy is recoverable from the stored data, with a known error.

SRD §9 states the criterion in one line — "the seeded eddy is recoverable from the stored
data with a known and reported error" — and §10 ranks the ground-truth manifest fourth
because it is what turns the harness "from toy into evidence". Constitution IX decides what
an answer may look like: "the eddy is recoverable" is meaningless without the error figure
beside it, so every test in this module prints a figure and the figure is what is asserted
on. There is no assertion here that the eddy was found. There is an assertion that it was
found to within a stated distance, and the distance is printed whether it passes or not.

**What is recovered, and from what.** A world is generated and written. C-04's sensor array
then surveys the *written field* — :class:`~eddy_recovery.StoredField` serves the sensors'
``Field`` protocol by interpolating the stored arrays — with the instruments
``config/local/sensors.json`` configures, and therefore with the noise those instruments
declare. The eddy's six parameters are then fitted to what came back. So the reported error
carries generation, the grid's own discretisation, float32 storage, interpolation and
instrument noise, in that order, and it is the only figure in the repository that carries
all five. What it does not carry is named in ``eddy_recovery``: the recovery is told that
the world holds a front, a thermocline and a drifter with the parameters the manifest
records, and is left to find the eddy. It is never shown the eddy's entry.

**Where the bound comes from, and why it is not a number somebody chose.** The generator
authors the eddy by jittering the configured centre, radius and strength within bands the
configuration states: ±2 km, ±5% and ±5%. Those configured values are on disk and cost
nothing to read. A recovery whose error is no smaller than the jitter band has therefore
told a reader nothing that ``config/local/env_generator.json`` did not already say — it has
recovered the configuration, not the world. Below the band it is resolving the draw the
seed made, which is the only part of the eddy not already written down. The bound is that
band, read out of the configuration document rather than typed here, so changing the jitter
moves the bound with it and no edit to this file can tune it. What the band is worth for
this seed is printed beside every result: the error a reader would have had by quoting the
configuration instead of surveying.

**Three ways it can fail, each measured.** A survey below the eddy, where its anomaly is a
fraction of the instrument's declared noise; a survey too sparse to resolve a feature of the
eddy's radius; and a survey paired with another run's manifest. Each is asserted to *miss*
the bound. Those are what stop the first test meaning nothing: a bound wide enough to admit
anything would admit these too, and they say so. Two more tests hold the ground the first
one stands on — that the residual handed to the fit contains the eddy and not the answer,
and that a cast sits on the stored depth levels for a reason that was measured rather than
assumed.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "tests" / "support") not in sys.path:  # pragma: no cover - import plumbing
    sys.path.insert(0, str(REPO_ROOT / "tests" / "support"))

from eddy_recovery import (  # noqa: E402
    Observation,
    RecoveredEddy,
    StoredField,
    anomalies,
    configured_instruments,
    fit_eddy,
    lawnmower,
    observe,
    stored_depths,
    without_feature,
)
from harness_env_generator.features.kernels import KM_PER_DEGREE, gaussian  # noqa: E402
from harness_env_generator.scoring import (  # noqa: E402
    RecoveryReport,
    score_eddy_recovery,
    score_point_recovery,
)
from support import build, read_json  # noqa: E402

CONFIG = REPO_ROOT / "config" / "local" / "env_generator.json"
EDDY_ID = "eddy_a"

SURVEY_SIDE = 12
"""Stations on a side. Twelve across a domain of roughly 220 km puts one about every 19 km,
so the eddy's configured 40 km radius spans two of them and its diameter four or five. That
is what resolving a feature means, and the thinning test below measures where it stops."""

SPARSE_SIDE = 2

CAST_M = (0.0, 500.0)
"""Shallowest and deepest of the survey's cast. Five hundred metres is nearly three
half-thicknesses below the eddy's configured depth of greatest anomaly, so the cast spans the
feature from above it to well below it and the fit has both flanks to work from."""

BLIND_CAST_M = (600.0, 1000.0)
"""A cast that begins below the eddy. The test that uses it measures how far below."""


def _configured_eddy() -> dict[str, Any]:
    return read_json(CONFIG)["env_generator"]["features"]["eddy"]


def bounds() -> dict[str, float]:
    """The jitter band the configuration states, which is what the recovery must beat.

    Centre is the per-axis band rather than the worst case: the generator draws north and
    east independently, so a draw can land at 2.83 km, and holding the recovery to 2.0 km
    is the tighter reading. Tighter is the right way for a bound to be wrong.
    """
    eddy = _configured_eddy()
    jitter = eddy["jitter"]
    return {
        "centre_error": float(jitter["centre_km"]),
        "radius_error": float(jitter["radius_fraction"]) * float(eddy["radius_km"]),
        "strength_error": float(jitter["strength_fraction"]) * float(eddy["strength_c"]),
    }


def _world(seed: int | None = None) -> Any:
    """One generated world, on the grid the local destination configures."""
    return build(read_json(CONFIG), root_seed=seed)


def _survey(
    world: Any,
    *,
    side: int = SURVEY_SIDE,
    depths_m: list[float] | None = None,
    stream: str = "acceptance-at03",
) -> tuple[Observation, ...]:
    return observe(
        world.manifest,
        StoredField(world.field_payload, world.manifest),
        lawnmower(world.manifest, side),
        depths_m=(
            stored_depths(world.manifest, shallowest_m=CAST_M[0], deepest_m=CAST_M[1])
            if depths_m is None
            else depths_m
        ),
        stream=stream,
    )


def _recover(manifest: Any, observations: tuple[Observation, ...]) -> RecoveredEddy:
    return fit_eddy(observations, anomalies(manifest, observations, feature_id=EDDY_ID))


def _score(manifest: Any, recovered: RecoveredEddy) -> RecoveryReport:
    return score_eddy_recovery(
        manifest,
        feature_id=EDDY_ID,
        centre_latitude=recovered.centre_latitude,
        centre_longitude=recovered.centre_longitude,
        radius_km=recovered.radius_km,
        strength_c=recovered.strength_c,
    )


def _configuration_report(manifest: Any) -> RecoveryReport:
    """What a reader would have had by quoting the configuration and surveying nothing."""
    eddy = _configured_eddy()
    return score_eddy_recovery(
        manifest,
        feature_id=EDDY_ID,
        centre_latitude=float(eddy["centre_latitude"]),
        centre_longitude=float(eddy["centre_longitude"]),
        radius_km=float(eddy["radius_km"]),
        strength_c=float(eddy["strength_c"]),
    )


def _temperature_report(
    manifest: Any, observations: tuple[Observation, ...], *, subject: str
) -> RecoveryReport:
    """Per-point temperature error against a manifest, through the generator's own scorer.

    ``score_point_recovery`` is the sibling of ``score_eddy_recovery`` and exists for this:
    a set of points, a recovered value at each, and mean-absolute, root-mean-square and
    largest-absolute figures with the variable's units attached. Given the whole manifest
    it measures the stored field against the analytic form; given the manifest with the
    eddy removed it measures the eddy.
    """
    return score_point_recovery(
        manifest,
        (
            (
                (
                    observation.latitude,
                    observation.longitude,
                    observation.depth_m,
                    observation.time_s,
                ),
                {"temperature_c": observation.temperature_c},
            )
            for observation in observations
        ),
        subject=subject,
    )


def _worst_ratio(report: RecoveryReport, limits: dict[str, float]) -> float:
    """The figure furthest outside its bound, as a multiple of it. Above one is a miss."""
    return max(figure.value / limits[figure.quantity] for figure in report.figures)


def _render(report: RecoveryReport, limits: dict[str, float]) -> str:
    return "\n".join(
        f"    {figure.quantity:<16}{figure.value:12.4g} {figure.units:<9}"
        f"bound {limits[figure.quantity]:.4g} "
        f"({figure.value / limits[figure.quantity]:.2f}x)"
        for figure in report.figures
    )


@pytest.fixture(scope="module")
def world() -> Any:
    """One world for the module. Generating it is three seconds and nothing mutates it."""
    return _world()


def test_at03_the_seeded_eddy_is_recovered_from_the_stored_field(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """The criterion itself: three figures, each below the band the configuration states."""
    observations = _survey(world)
    recovered = _recover(world.manifest, observations)
    report = _score(world.manifest, recovered)
    limits = bounds()
    noise = next(
        instrument.noise_standard_deviation
        for instrument in configured_instruments()
        if instrument.measured == "temperature"
    )

    with capsys.disabled():
        print(
            f"\n  AT-03: {recovered.sample_count} stored temperatures from a "
            f"{SURVEY_SIDE}x{SURVEY_SIDE} survey over "
            f"{len(observations) // (SURVEY_SIDE * SURVEY_SIDE)} stored depth levels"
            f"\n  recovery error against the ground-truth manifest:"
            f"\n{_render(report, limits)}"
            f"\n  the same figures for quoting the configuration and surveying nothing:"
            f"\n{_render(_configuration_report(world.manifest), limits)}"
            f"\n  recovered sign {recovered.sign:+d}, depth of greatest anomaly "
            f"{recovered.depth_centre_m:.1f} m, half-thickness "
            f"{recovered.depth_half_thickness_m:.1f} m"
            f"\n  fit residual {recovered.residual_rms_c:.4f} degree_C against the "
            f"instrument's declared {noise} degree_C: what the eddy's form does not "
            f"explain is the noise and the stored grid's own discretisation, not a feature "
            f"left in the water"
            f"\n  bound: the authoring jitter band from {CONFIG.relative_to(REPO_ROOT)} — "
            f"a recovery no better than this has recovered the configuration"
        )

    assert recovered.sign == int(_configured_eddy()["sign"])
    assert _worst_ratio(report, limits) < 1.0


def test_at03_the_recovery_is_the_same_recovery_twice(world: Any) -> None:
    """Constitution II, in the form AT-03 needs it: the figure is a function of the seed.

    A reported error that moved between runs would not be a known error. The sampling draws
    its noise through ``harness_core.rng`` and the fit draws nothing at all, so two surveys
    of one world agree exactly rather than closely — and the process having sampled once
    already is what would break it if the noise came from anywhere but the seed.
    """
    first = _survey(world)
    second = _survey(world)

    assert first == second
    assert _recover(world.manifest, first) == _recover(world.manifest, second)


def test_at03_a_survey_below_the_eddy_cannot_recover_it(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """An unobserved region, and the arithmetic that says it is unobserved.

    The eddy's anomaly falls off as a Gaussian in depth about the depth of greatest anomaly.
    The figure printed below is what is left of it at the top of this cast, computed from the
    manifest's own eddy entry: a fraction of the temperature instrument's declared standard
    deviation. A survey confined here is looking at noise, and the recovery is not entitled
    to find an eddy in noise. Ground truth is used to explain why the region is blind; it is
    not used to recover anything.
    """
    blind = stored_depths(world.manifest, shallowest_m=BLIND_CAST_M[0], deepest_m=BLIND_CAST_M[1])
    observations = _survey(world, depths_m=blind)
    values = anomalies(world.manifest, observations, feature_id=EDDY_ID)
    recovered = fit_eddy(observations, values)
    report = _score(world.manifest, recovered)
    limits = bounds()
    noise = next(
        instrument.noise_standard_deviation
        for instrument in configured_instruments()
        if instrument.measured == "temperature"
    )
    largest = max(abs(value) for value in values)
    truth = next(entry for entry in world.manifest["features"] if entry["id"] == EDDY_ID)[
        "parameters"
    ]
    at_the_top = float(truth["strength_c"]) * gaussian(
        blind[0] - float(truth["depth_centre_m"]), float(truth["depth_half_thickness_m"])
    )

    with capsys.disabled():
        print(
            f"\n  AT-03 (negative): {recovered.sample_count} temperatures from "
            f"{blind[0]:.0f}-{blind[-1]:.0f} m only"
            f"\n  the eddy's own anomaly at {blind[0]:.0f} m, from the manifest: "
            f"{at_the_top:.5f} degree_C, against the instrument's declared {noise} "
            f"degree_C, smaller by a factor of {noise / at_the_top:.0f}, so there is "
            f"nothing here to fit"
            f"\n  largest residual actually seen: {largest:.4f} degree_C, which is the "
            f"noise's own extreme over {recovered.sample_count} draws"
            f"\n{_render(report, limits)}"
        )

    assert _worst_ratio(report, limits) > 1.0


def test_at03_a_survey_too_sparse_to_resolve_the_eddy_cannot_recover_it(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """How few stations is too few, measured rather than guessed.

    The survey is thinned and the error reported at each width, so the figure that matters
    is where it crosses the bound rather than the fact that some chosen sparse survey fails.
    The assertion is on the ends: the full survey is inside the bound and the two-station
    one is outside it. Between them is a measurement, printed, and it is not a claim about
    any other domain or any other eddy.
    """
    limits = bounds()
    rows: list[str] = []
    ratios: dict[int, float] = {}
    for side in (SURVEY_SIDE, 8, 5, 3, SPARSE_SIDE):
        observations = _survey(world, side=side)
        report = _score(world.manifest, _recover(world.manifest, observations))
        ratios[side] = _worst_ratio(report, limits)
        rows.append(
            f"    {side:>2}x{side:<2} {len(observations):>5} obs   "
            + "   ".join(f"{figure.value:9.4g} {figure.units}" for figure in report.figures)
            + f"   worst {ratios[side]:6.2f}x"
        )

    latitude = world.manifest["grid"]["latitude"]
    extent_km = (float(latitude["maximum"]) - float(latitude["minimum"])) * KM_PER_DEGREE
    spacing_km = extent_km / SPARSE_SIDE
    radius_km = float(_configured_eddy()["radius_km"])
    with capsys.disabled():
        print(
            "\n  AT-03 (thinning): centre, radius and strength error by survey width"
            f"\n{chr(10).join(rows)}"
            f"\n  the {SPARSE_SIDE}x{SPARSE_SIDE} survey spaces stations about "
            f"{spacing_km:.0f} km apart across a {extent_km:.0f} km domain, wider than the "
            f"eddy's configured {radius_km:.0f} km radius; it cannot resolve the feature "
            f"and does not claim to"
        )

    assert ratios[SURVEY_SIDE] < 1.0
    assert ratios[SPARSE_SIDE] > 1.0


def test_at03_a_survey_paired_with_another_run_s_manifest_cannot_recover_it(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """The observations and the manifest have to be from the same run.

    The recovery removes the rest of the world using a manifest. Given another seed's
    manifest, what it removes is another seed's front and thermocline, and the difference
    between the two goes into the residual and out again as a displaced eddy. This is the
    assertion that keeps the first test from being satisfied by a recovery that ignored its
    inputs: a fit that returned the same eddy whatever it was given would pass every bound
    above and fail here.
    """
    other = _world(seed=20260827)
    observations = _survey(world)
    mismatched = fit_eddy(observations, anomalies(other.manifest, observations, feature_id=EDDY_ID))
    report = _score(world.manifest, mismatched)
    matched = _score(world.manifest, _recover(world.manifest, observations))
    limits = bounds()

    with capsys.disabled():
        print(
            f"\n  AT-03 (negative): the same {len(observations)} observations, with the "
            f"rest of the world removed using seed "
            f"{other.manifest['seed']['root']}'s manifest instead of seed "
            f"{world.manifest['seed']['root']}'s"
            f"\n{_render(report, limits)}"
            f"\n  against {matched.figure('centre_error').value:.4g} km of centre error "
            f"with the right manifest"
        )

    assert _worst_ratio(report, limits) > 1.0
    assert report.figure("centre_error").value > matched.figure("centre_error").value


def test_at03_the_residual_the_recovery_is_given_holds_the_eddy_and_nothing_else(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """The module docstring's scope claim, made checkable rather than left as prose.

    The same stored temperatures scored twice by ``score_point_recovery``. Against the whole
    manifest, what is left is the stored field's disagreement with the analytic form plus
    the instrument's noise — a twentieth of the eddy's strength, and no eddy in it. Against
    the manifest with the eddy taken out, which is the residual the fit is handed, what is
    left is the eddy at close to its configured strength. If the recovery were ever handed
    the answer the two would be the same figure, every bound above would collapse to the
    fit's own arithmetic, and nothing else in this module would notice.
    """
    observations = _survey(world, side=5)
    whole = _temperature_report(world.manifest, observations, subject="the whole manifest")
    less_the_eddy = _temperature_report(
        without_feature(world.manifest, EDDY_ID),
        observations,
        subject="the manifest with the eddy removed",
    )
    strength = float(_configured_eddy()["strength_c"])

    figures = "\n".join(
        f"      {figure}"
        for report in (whole, less_the_eddy)
        for figure in (f"against {report.subject}:", *(str(f) for f in report.figures))
    )
    with capsys.disabled():
        print(
            f"\n  AT-03 (scope): {whole.sample_count} stored temperatures, scored twice —"
            f"\n    once against the whole manifest, where what is left is storage, "
            f"interpolation and instrument noise, and once against the manifest with the "
            f"eddy removed, which is the residual the fit is handed"
            f"\n{figures}"
            f"\n    the eddy is configured at {strength} degree_C"
        )

    assert whole.figure("temperature_c.max_absolute_error").value < 0.1 * strength
    assert less_the_eddy.figure("temperature_c.max_absolute_error").value > 0.5 * strength


def test_at03_a_cast_between_the_stored_depth_levels_reads_the_grid_not_the_world(
    world: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """Why the survey samples the levels the field is stored on, measured rather than claimed.

    The stored field is linear between depth levels. The configured grid spaces them 50 m
    apart and the configured thermocline turns over in 25 m, so the grid cannot represent
    the thermocline and a value read halfway between two levels is a chord across a curve.
    The figure below is what that costs, and it is an order of magnitude larger than the
    eddy's whole recovery error — which is why a cast placed between the levels would report
    the grid's vertical resolution under the name of the eddy's recoverability.

    This is a property of the stored field worth having on the record. It is not a defect in
    the recovery, and it is not what AT-03 measures.
    """
    stations = lawnmower(world.manifest, 5)
    field = StoredField(world.field_payload, world.manifest)
    on_levels = stored_depths(world.manifest, shallowest_m=CAST_M[0], deepest_m=CAST_M[1])
    step = on_levels[1] - on_levels[0]
    between = [level + step / 2.0 for level in on_levels[:-1]]

    def largest_disagreement(depths_m: list[float]) -> float:
        sampled = observe(
            world.manifest,
            field,
            stations,
            depths_m=depths_m,
            stream="acceptance-at03.depths",
        )
        report = _temperature_report(world.manifest, sampled, subject="stored field")
        return report.figure("temperature_c.max_absolute_error").value

    on_level = largest_disagreement(on_levels)
    off_level = largest_disagreement(between)
    thermocline = next(
        entry for entry in world.manifest["features"] if entry["kind"] == "thermocline"
    )

    with capsys.disabled():
        print(
            f"\n  AT-03 (why the cast sits on the levels): largest disagreement between the "
            f"stored field and the analytic form,"
            f"\n    on the {step:.0f} m stored levels:  {on_level:.4f} degree_C"
            f"\n    halfway between them:      {off_level:.4f} degree_C"
            f"\n  the thermocline turns over in "
            f"{thermocline['parameters']['thickness_m']:.1f} m, which a {step:.0f} m grid "
            f"does not resolve; between the levels the stored field is a chord across that "
            f"curve"
        )

    assert off_level > 5.0 * on_level
