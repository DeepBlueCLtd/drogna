"""drogna's shared foundations: the clock, the RNG, config loading and the run manifest.

Three properties the SRD says cannot be retrofitted live in this package. Time comes
from the simulation clock service and nowhere else (Constitution I). Randomness comes
from the run's root seed through a versioned derivation rule (Constitution II).
Configuration arrives by name in one environment variable and is validated before any
other I/O (Constitution IV).
"""

from harness_core.clock import (
    Clock,
    ClockMode,
    ClockState,
    ClockStatus,
    ManualClock,
    ParticipantRole,
    RemoteClock,
    SimInstant,
    Tick,
)
from harness_core.config import HARNESS_CONFIG_VARIABLE, LoadedConfig, load_config, load_or_exit
from harness_core.rng import RandomStreams, configure_run, identifier_for, rng_for

__all__ = [
    "HARNESS_CONFIG_VARIABLE",
    "Clock",
    "ClockMode",
    "ClockState",
    "ClockStatus",
    "LoadedConfig",
    "ManualClock",
    "ParticipantRole",
    "RandomStreams",
    "RemoteClock",
    "SimInstant",
    "Tick",
    "configure_run",
    "identifier_for",
    "load_config",
    "load_or_exit",
    "rng_for",
]
