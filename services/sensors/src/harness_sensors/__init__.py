"""C-04: simulated sensors, and the first half of the observation path.

The sensors sample the generated world at a position and a simulation instant, add the
noise their instrument declares, and publish the result on ``obs/<thing-id>/<datastream-id>``
in SensorThings vocabulary. They carry no bespoke logic of their own, which is what a
simulated instrument ought to look like: the world is the environment generator's, the
identifiers are the seed's, and the time is the clock's.

Three datastreams and no more — temperature, salinity and pressure. Sound speed is derived
at the point of use by the single implementation in ``libs/harness_core`` and is never
published (ADR-0005), so there is no fourth instrument here and the message schema will
refuse one.
"""

from harness_sensors.identifiers import feature_of_interest_id, observation_id
from harness_sensors.publisher import OBSERVATION_NAMESPACE, ObservationPublisher, topic_for
from harness_sensors.sensor import Instrument, Platform, SensorArray

__all__ = [
    "OBSERVATION_NAMESPACE",
    "Instrument",
    "ObservationPublisher",
    "Platform",
    "SensorArray",
    "feature_of_interest_id",
    "observation_id",
    "topic_for",
]
