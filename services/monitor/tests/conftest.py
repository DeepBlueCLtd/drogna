"""Fixtures over the helpers in :mod:`support`."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from harness_monitor.coverage import ForecastField
from harness_monitor.observations import Sounding
from monitor_support import sounding, uniform_field


@pytest.fixture
def field() -> ForecastField:
    return uniform_field()


@pytest.fixture
def make_sounding() -> Callable[..., Sounding]:
    return sounding
