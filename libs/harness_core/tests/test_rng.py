"""Randomness that replays: same seed and stream, same sequence, in any process."""

from __future__ import annotations

import subprocess
import sys
import textwrap

import pytest
from harness_core import rng
from harness_core.ports import RandomStreams as RandomStreamsPort
from harness_core.rng import DERIVATION_RULE, DERIVATION_VERSION, RandomStreams


def draws(streams: RandomStreams, stream: str, count: int = 5) -> list[float]:
    generator = streams.rng_for(stream)
    return [generator.random() for _ in range(count)]


def test_the_streams_object_satisfies_the_rng_port() -> None:
    assert isinstance(RandomStreams(1), RandomStreamsPort)


def test_the_same_root_seed_and_stream_give_the_same_sequence() -> None:
    first = draws(RandomStreams(12345), "env_generator.field")
    second = draws(RandomStreams(12345), "env_generator.field")
    assert first == second


def test_a_different_root_seed_gives_a_different_sequence() -> None:
    assert draws(RandomStreams(12345), "env_generator.field") != draws(
        RandomStreams(12346), "env_generator.field"
    )


def test_different_streams_under_one_seed_do_not_collide() -> None:
    streams = RandomStreams(12345)
    field = draws(streams, "env_generator.field")
    noise = draws(streams, "sensors.noise")
    schedule = draws(streams, "scheduler.jitter")
    assert field != noise != schedule
    assert field != schedule


def test_one_stream_name_means_one_generator() -> None:
    """Two call sites asking for one name share a sequence; their draws interleave."""
    streams = RandomStreams(12345)
    first = streams.rng_for("sensors.noise")
    second = streams.rng_for("sensors.noise")
    assert first is second

    reference = RandomStreams(12345).rng_for("sensors.noise")
    interleaved = [first.random(), second.random(), first.random()]
    assert interleaved == [reference.random() for _ in range(3)]


def test_the_sequence_is_identical_in_a_separate_process() -> None:
    script = textwrap.dedent(
        """
        from harness_core.rng import RandomStreams
        streams = RandomStreams(12345)
        generator = streams.rng_for("env_generator.field")
        print(",".join(repr(generator.random()) for _ in range(5)))
        """
    )
    completed = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=True
    )
    in_process = draws(RandomStreams(12345), "env_generator.field")
    assert [float(value) for value in completed.stdout.strip().split(",")] == in_process


def test_entropy_is_available_for_generators_this_module_does_not_build() -> None:
    streams = RandomStreams(12345)
    entropy = streams.entropy_for("env_generator.field")
    assert entropy == RandomStreams(12345).entropy_for("env_generator.field")
    assert 0 < entropy < 2**256


def test_identifiers_are_stable_across_runs_and_differ_across_positions() -> None:
    first_run = RandomStreams(12345)
    second_run = RandomStreams(12345)
    assert first_run.identifier_for("ingest.observation", 17) == second_run.identifier_for(
        "ingest.observation", 17
    )
    assert first_run.identifier_for("ingest.observation", 17) != first_run.identifier_for(
        "ingest.observation", 18
    )
    assert first_run.identifier_for("ingest.observation", 17) != first_run.identifier_for(
        "sensors.observation", 17
    )


def test_derived_uuids_have_the_shape_of_uuid4_and_none_of_its_entropy() -> None:
    first = RandomStreams(12345).uuid_for("ingest.observation", 3)
    second = RandomStreams(12345).uuid_for("ingest.observation", 3)
    assert first == second
    assert first.version == 8  # RFC 9562 custom: derived, not random
    assert str(first) != str(RandomStreams(12345).uuid_for("ingest.observation", 4))


def test_the_derivation_rule_and_version_are_what_the_manifest_records() -> None:
    streams = RandomStreams(12345)
    assert streams.derivation == {"rule": DERIVATION_RULE, "version": DERIVATION_VERSION}


def test_a_negative_or_non_integer_root_seed_is_refused() -> None:
    with pytest.raises(ValueError, match="not negative"):
        RandomStreams(-1)
    with pytest.raises(TypeError):
        RandomStreams(1.5)  # type: ignore[arg-type]


def test_drawing_before_the_run_is_configured_is_refused_rather_than_guessed() -> None:
    rng.reset_run()
    with pytest.raises(RuntimeError, match="no root seed has been configured"):
        rng.rng_for("sensors.noise")

    rng.configure_run(12345)
    try:
        assert rng.rng_for("sensors.noise") is rng.rng_for("sensors.noise")
        assert rng.identifier_for("sensors.noise", 0) == RandomStreams(12345).identifier_for(
            "sensors.noise", 0
        )
    finally:
        rng.reset_run()


def test_the_streams_drawn_from_are_recorded_in_request_order() -> None:
    streams = RandomStreams(12345)
    streams.rng_for("b.two")
    streams.rng_for("a.one")
    streams.rng_for("b.two")
    assert streams.streams() == ("b.two", "a.one")
