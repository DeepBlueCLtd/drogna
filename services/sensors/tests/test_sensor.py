"""What a sensor array publishes: the field plus seeded noise, in the generated shape.

Two properties are load-bearing and both are asserted rather than assumed. The noise comes
from the RNG port, so a second run from the same root seed produces the same values; and
the array publishes exactly three datastreams, so a sound-speed instrument cannot be
configured into existence without ADR-0005 being amended.
"""

from __future__ import annotations

import pytest
import sensors_support as support
from harness_core.clock import ClockMode, ManualClock
from harness_core.rng import configure_run, reset_run
from harness_sensors.sensor import SensorArray
from harness_types.messages.observation import DrognaObservation

STREAM = "sensors"


@pytest.fixture(autouse=True)
def _seeded() -> None:
    configure_run(support.ROOT_SEED)
    yield
    reset_run()


def clock() -> ManualClock:
    return ManualClock(
        run_id="run-0001",
        epoch=support.EPOCH,
        tick_interval_us=60_000_000,
        mode=ClockMode.LOCKSTEP,
    )


def array(standard_deviation: float = 0.0, depths: tuple[float, ...] = (0.0, 50.0)) -> SensorArray:
    return SensorArray(
        platform=support.platform(),
        instruments=support.instruments(standard_deviation),
        positions=support.positions(),
        depths_m=list(depths),
        field=support.LinearField(),
        seed_stream=STREAM,
    )


def test_one_event_publishes_every_depth_and_every_instrument() -> None:
    observations = array().sample(clock().tick())
    assert len(observations) == 6
    assert {entry["observed_property"] for entry in observations} == {
        "temperature",
        "salinity",
        "pressure",
    }


def test_every_message_validates_against_the_generated_type() -> None:
    for observation in array(standard_deviation=0.02).sample(clock().tick()):
        DrognaObservation.model_validate(observation)


def test_a_noiseless_instrument_publishes_the_field_value_unchanged() -> None:
    tick = clock().tick()
    observations = array().sample(tick)
    field = support.LinearField()
    for observation in observations:
        truth = field.at(
            latitude=observation["location"]["latitude"],
            longitude=observation["location"]["longitude"],
            depth_m=observation["location"]["depth_m"],
            instant=tick.instant,
        )
        assert observation["result"] == pytest.approx(truth[observation["observed_property"]])


def test_noise_is_reproducible_from_the_root_seed() -> None:
    tick = clock().tick()
    first = [entry["result"] for entry in array(standard_deviation=0.05).sample(tick)]
    configure_run(support.ROOT_SEED)
    second = [entry["result"] for entry in array(standard_deviation=0.05).sample(tick)]
    assert first == second


def test_a_different_root_seed_gives_different_noise() -> None:
    tick = clock().tick()
    first = [entry["result"] for entry in array(standard_deviation=0.05).sample(tick)]
    configure_run(support.ROOT_SEED + 1)
    second = [entry["result"] for entry in array(standard_deviation=0.05).sample(tick)]
    assert first != second


def test_noise_stays_within_a_plausible_multiple_of_its_declared_deviation() -> None:
    """Not a distribution test: a guard that the draw is scaled by what was configured."""
    sigma = 0.05
    moving = clock()
    quiet = array(standard_deviation=0.0)
    noisy = array(standard_deviation=sigma)
    differences = []
    for _ in range(20):
        tick = moving.advance()
        published = noisy.sample(tick)
        truth = quiet.sample(tick)
        differences.extend(
            abs(a["result"] - b["result"])
            for a, b in zip(published, truth, strict=True)
            if a["observed_property"] == "temperature"
        )
    assert max(differences) < 6 * sigma
    assert max(differences) > 0


def test_the_instrument_describes_the_noise_it_actually_adds() -> None:
    metadata = support.instrument("temperature", standard_deviation=0.02).noise_metadata
    assert "0.02" in metadata
    assert "degC" in metadata
    assert "No noise" in support.instrument("temperature").noise_metadata


def test_ordinals_advance_in_the_order_the_array_samples_in() -> None:
    sensors = array()
    moving = clock()
    first = sensors.sample(moving.tick())
    second = sensors.sample(moving.advance())
    assert len({entry["observation_id"] for entry in first + second}) == 12
    assert sensors.ordinal == 12


def test_the_platform_returns_to_its_positions_in_order() -> None:
    sensors = array()
    moving = clock()
    longitudes = [sensors.sample(moving.advance())[0]["location"]["longitude"] for _ in range(4)]
    assert longitudes == [-4.5, -4.3, -4.5, -4.3]


def test_a_fourth_datastream_is_refused() -> None:
    """A sound-speed instrument cannot be configured into existence (ADR-0005)."""
    with pytest.raises(ValueError, match="exactly 3 datastreams"):
        SensorArray(
            platform=support.platform(),
            instruments=[*support.instruments(), support.instrument("temperature")],
            positions=support.positions(),
            depths_m=[0.0],
            field=support.LinearField(),
            seed_stream=STREAM,
        )


def test_a_sound_speed_observed_property_is_refused_by_the_configuration() -> None:
    with pytest.raises(ValueError, match="not one of the three published properties"):
        support.instrument("sound_speed")


def test_the_three_must_be_distinct() -> None:
    with pytest.raises(ValueError, match="the three datastreams are"):
        SensorArray(
            platform=support.platform(),
            instruments=[
                support.instrument("temperature"),
                support.instrument("temperature"),
                support.instrument("salinity"),
            ],
            positions=support.positions(),
            depths_m=[0.0],
            field=support.LinearField(),
            seed_stream=STREAM,
        )
