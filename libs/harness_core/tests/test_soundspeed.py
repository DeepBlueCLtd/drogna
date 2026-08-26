"""Sound speed: one implementation, a stated equation, a stated validity range."""

from __future__ import annotations

import pytest

from harness_core.soundspeed import (
    EQUATION,
    VALIDITY,
    depth_from_pressure,
    sound_speed,
    sound_speed_from_pressure,
    within_validity,
)


def test_the_equation_is_named_so_a_residual_can_say_what_produced_it() -> None:
    assert EQUATION == "mackenzie-1981"


def test_it_reproduces_the_published_check_value() -> None:
    """Mackenzie's own worked value: 25 C, 35 PSU, 1000 m gives 1550.744 m/s."""
    assert sound_speed(25.0, 35.0, 1000.0) == pytest.approx(1550.744, abs=1e-3)


def test_it_is_monotonic_in_each_variable_over_the_working_range() -> None:
    assert sound_speed(10.0, 35.0, 0.0) < sound_speed(15.0, 35.0, 0.0)
    assert sound_speed(10.0, 34.0, 0.0) < sound_speed(10.0, 36.0, 0.0)
    assert sound_speed(10.0, 35.0, 0.0) < sound_speed(10.0, 35.0, 500.0)


def test_values_outside_the_validity_range_are_refused_rather_than_extrapolated() -> None:
    assert within_validity(10.0, 35.0, 100.0)
    assert not within_validity(45.0, 35.0, 100.0)

    with pytest.raises(ValueError, match="fitted for"):
        sound_speed(45.0, 35.0, 100.0)
    with pytest.raises(ValueError, match="fitted for"):
        sound_speed(10.0, 35.0, VALIDITY.max_depth_m + 1.0)


def test_the_range_check_can_be_waived_for_a_field_rather_than_a_point() -> None:
    assert sound_speed(45.0, 35.0, 100.0, check_range=False) > 0


def test_pressure_converts_to_depth_within_a_metre_or_two_at_working_depths() -> None:
    assert depth_from_pressure(100.0) == pytest.approx(99.0, abs=1.0)
    assert depth_from_pressure(1000.0) == pytest.approx(990.0, abs=2.0)


def test_the_pressure_form_agrees_with_the_depth_form() -> None:
    depth = depth_from_pressure(500.0)
    assert sound_speed_from_pressure(12.0, 35.0, 500.0) == sound_speed(12.0, 35.0, depth)


def test_the_arithmetic_is_elementwise_so_a_field_works_as_well_as_a_point() -> None:
    class Column:
        """A stand-in for an array: only the operators the equation uses."""

        def __init__(self, values: tuple[float, ...]) -> None:
            self.values = values

        def _apply(self, other: object, operation: str) -> Column:
            import operator

            function = getattr(operator, operation)
            if isinstance(other, Column):
                return Column(tuple(function(a, b) for a, b in zip(self.values, other.values)))
            return Column(tuple(function(value, other) for value in self.values))

        def __add__(self, other: object) -> Column:
            return self._apply(other, "add")

        __radd__ = __add__

        def __sub__(self, other: object) -> Column:
            return self._apply(other, "sub")

        def __rsub__(self, other: object) -> Column:
            return Column(tuple(other - value for value in self.values))  # type: ignore[operator]

        def __mul__(self, other: object) -> Column:
            return self._apply(other, "mul")

        __rmul__ = __mul__

        def __pow__(self, power: object) -> Column:
            return self._apply(power, "pow")

    temperatures = Column((5.0, 10.0, 15.0))
    result = sound_speed(temperatures, 35.0, 0.0)
    assert isinstance(result, Column)
    assert result.values == tuple(sound_speed(value, 35.0, 0.0) for value in (5.0, 10.0, 15.0))
