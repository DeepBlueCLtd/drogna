"""Nothing invalid reaches the store, and every refusal is counted and kept.

The cases here are the ones the specification names: a malformed message, a mixed batch,
a control-shaped message published on an observation topic, and a sound-speed observed
property. The last two are the interesting ones — they are what namespace discipline and
ADR-0005 look like from inside the ingestion seam.
"""

from __future__ import annotations

import ingest_support as support
import pytest
from harness_ingest.validation import Rejection, RejectionLog, validate


def test_a_well_formed_observation_is_accepted() -> None:
    payload = support.delivery(support.observation()).payload
    outcome = validate("obs/platform-a/ds-temperature", payload)
    assert outcome.accepted
    assert outcome.observation is not None
    assert outcome.observation.observed_property.value == "temperature"


def test_a_payload_that_is_not_json_is_refused_with_a_reason() -> None:
    outcome = validate("obs/platform-a/ds-temperature", b"{not json")
    assert not outcome.accepted
    assert outcome.rejection is not None
    assert "not valid JSON" in outcome.rejection.reason


def test_a_missing_field_is_refused_and_names_the_field() -> None:
    message = support.observation()
    del message["result"]
    outcome = validate("obs/platform-a/ds-temperature", support.delivery(message).payload)
    assert not outcome.accepted
    assert "result" in outcome.rejection.reason


def test_an_unknown_field_is_refused() -> None:
    """The schema is closed, so a typo in a key is caught rather than silently stored."""
    message = support.observation()
    message["sound_speed_m_s"] = 1500.0
    outcome = validate("obs/platform-a/ds-temperature", support.delivery(message).payload)
    assert not outcome.accepted


def test_a_sound_speed_observed_property_is_refused() -> None:
    """FR-023 and SC-012: sound speed is derived at the point of use and is not stored."""
    message = support.observation()
    message["observed_property"] = "sound_speed"
    outcome = validate("obs/platform-a/ds-sound-speed", support.delivery(message).payload)
    assert not outcome.accepted
    assert "observed_property" in outcome.rejection.reason


def test_a_control_message_on_an_observation_topic_is_refused() -> None:
    """Namespace discipline at the other end: the broker's list is not the only guard."""
    heartbeat = {
        "component": "sensors",
        "sim_time": "2026-09-01T00:00:00.000000Z",
        "tick": 3,
        "status": "ok",
        "run_id": "run-0001",
    }
    outcome = validate("obs/platform-a/ds-temperature", support.delivery(heartbeat).payload)
    assert not outcome.accepted
    assert "not an observation" in outcome.rejection.reason


def test_a_json_array_is_refused() -> None:
    outcome = validate("obs/platform-a/ds-temperature", b"[]")
    assert not outcome.accepted
    assert "JSON object" in outcome.rejection.reason


def test_the_rejection_log_counts_without_bound_and_keeps_up_to_one() -> None:
    log = RejectionLog(maximum_retained=3)
    for index in range(10):
        log.record(Rejection("obs/x/y", b"{}", f"reason {index}"))
    assert log.count == 10
    assert len(log) == 3
    assert log.discarded == 7
    assert [entry.reason for entry in log.retained()] == ["reason 7", "reason 8", "reason 9"]


def test_a_log_that_keeps_nothing_is_refused() -> None:
    with pytest.raises(ValueError, match="nothing to inspect"):
        RejectionLog(maximum_retained=0)


def test_a_long_reason_is_kept_short_enough_to_hold_thousands_of() -> None:
    message = support.observation()
    message["context"] = {}
    outcome = validate("obs/platform-a/ds-temperature", support.delivery(message).payload)
    assert not outcome.accepted
    assert len(outcome.rejection.reason) <= 400
