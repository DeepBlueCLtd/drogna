"""Truth as a function: a manifest and a point in, the state of the world out.

**This is the interface AT-01 and AT-03 score against.** Not the stored grid. A trajectory
query's vertices will not land on grid nodes, and an eddy recovery error in kilometres
needs a centre to subtract, not an array to eyeball. Anything that scores recovery against
the interpolated field file is measuring the interpolation as well as the recovery, and
Constitution IX asks for the error figure, not for a figure plus an artefact.

The evaluator opens no field file, ever. It reads the manifest's analytic parameters and
computes. That is what makes the manifest's sufficiency (FR-013) a property with a test
behind it rather than a claim: if anything that shapes the field lived only in the
generator's internal state, the evaluator would disagree with the stored field and the
comparison at every grid point would say so.

What comes back is the evaluated field and only the evaluated field: temperature,
salinity, pressure, sound speed and the decorrelation timescale. ADR-0002 forbids leaking
the authored per-feature representation to consumers, so there is no way through this
interface to ask which feature a location belongs to, or what weight it carries there.

Sound speed is not computed here. It is derived by :mod:`harness_core.soundspeed`, the one
implementation in drogna (ADR-0005), and this module calls it. A second copy would make a
recovery error partly an artefact of the disagreement between the copies, which is exactly
the failure AT-03 exists to detect.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from harness_core.soundspeed import EQUATION, sound_speed

from harness_env_generator.background import Background
from harness_env_generator.compose import compose
from harness_env_generator.errors import OutOfDomainError
from harness_env_generator.features.base import Feature
from harness_env_generator.features.eddy import Eddy
from harness_env_generator.features.front import Front
from harness_env_generator.features.moving import MovingFeature
from harness_env_generator.features.thermocline import Thermocline
from harness_env_generator.grid import Grid, PressureRelation
from harness_env_generator.timescale import TimescaleField
from harness_env_generator.version import ANALYTIC_FORM_VERSION

__all__ = ["VARIABLES", "Evaluator", "Truth", "VariableSpec", "features_from_manifest"]


@dataclass(frozen=True)
class VariableSpec:
    """One written variable: how it is named, what it is in, and where its value lives."""

    name: str
    standard_name: str | None
    long_name: str
    units: str
    attribute: str


VARIABLES: tuple[VariableSpec, ...] = (
    VariableSpec(
        name="sea_water_temperature",
        standard_name="sea_water_temperature",
        long_name="sea water temperature",
        units="degree_C",
        attribute="temperature_c",
    ),
    VariableSpec(
        name="sea_water_practical_salinity",
        standard_name="sea_water_practical_salinity",
        long_name="sea water practical salinity",
        units="1e-3",
        attribute="salinity_psu",
    ),
    VariableSpec(
        name="sea_water_pressure",
        standard_name="sea_water_pressure",
        long_name="sea water pressure",
        units="dbar",
        attribute="pressure_dbar",
    ),
    VariableSpec(
        name="speed_of_sound_in_sea_water",
        standard_name="speed_of_sound_in_sea_water",
        long_name="speed of sound in sea water",
        units="m s-1",
        attribute="sound_speed_m_s",
    ),
    VariableSpec(
        # CF has no standard name for a decorrelation timescale. Null is stated in the
        # manifest rather than a plausible name invented: a standard name that is not in
        # the table is a claim the vocabulary does not support.
        name="decorrelation_timescale",
        standard_name=None,
        long_name="decorrelation timescale",
        units="s",
        attribute="decorrelation_timescale_s",
    ),
)

_FEATURE_KINDS: dict[str, type[Feature]] = {
    "eddy": Eddy,
    "front": Front,
    "thermocline": Thermocline,
    "moving": MovingFeature,
}


@dataclass(frozen=True)
class Truth:
    """The state of the world at one point. What a consumer is entitled to see."""

    temperature_c: float
    salinity_psu: float
    pressure_dbar: float
    sound_speed_m_s: float
    decorrelation_timescale_s: float

    def as_mapping(self) -> dict[str, float]:
        return {
            "temperature_c": self.temperature_c,
            "salinity_psu": self.salinity_psu,
            "pressure_dbar": self.pressure_dbar,
            "sound_speed_m_s": self.sound_speed_m_s,
            "decorrelation_timescale_s": self.decorrelation_timescale_s,
        }


def features_from_manifest(document: Mapping[str, Any]) -> tuple[Feature, ...]:
    """Rebuild the four features from a manifest, which is all a consumer ever has."""
    rebuilt: list[Feature] = []
    for entry in document["features"]:
        kind = str(entry["kind"])
        cls = _FEATURE_KINDS[kind]
        rebuilt.append(
            cls.from_parameters(  # type: ignore[attr-defined]
                str(entry["id"]),
                float(entry["timescale_seconds"]),
                entry["parameters"],
            )
        )
    return tuple(rebuilt)


class Evaluator:
    """The pure function from a ground-truth manifest and a point to the truth there."""

    def __init__(
        self,
        *,
        grid: Grid,
        background: Background,
        features: tuple[Feature, ...],
        pressure: PressureRelation,
        timescale: TimescaleField,
    ) -> None:
        self.grid = grid
        self.background = background
        self.features = features
        self.pressure = pressure
        self.timescale = timescale

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> Evaluator:
        """Build from a manifest. The generator need not be running and the field need not exist."""
        form = int(document["generator"]["analytic_form_version"])
        if form != ANALYTIC_FORM_VERSION:
            raise ValueError(
                f"this evaluator implements analytic form {ANALYTIC_FORM_VERSION}; the "
                f"manifest was written by form {form}. Reconstructing it under a different "
                "form would report the difference as a recovery error"
            )
        features = features_from_manifest(document)
        return cls(
            grid=Grid.from_manifest(document["grid"]),
            background=Background.from_manifest(document["background"]),
            features=features,
            pressure=PressureRelation.from_manifest(document["pressure_relation"]),
            timescale=TimescaleField.from_manifest(document["timescale"], features),
        )

    # Domain ------------------------------------------------------------------------

    def contains(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> bool:
        """Whether the point lies inside the domain the manifest describes."""
        return (
            self.grid.latitude.contains(latitude)
            and self.grid.longitude.contains(longitude)
            and self.grid.depth.contains(depth_m)
            and self.grid.time.contains(time_s)
        )

    def _require_domain(
        self, latitude: float, longitude: float, depth_m: float, time_s: float
    ) -> None:
        for axis, value, extent in (
            ("latitude", latitude, self.grid.latitude),
            ("longitude", longitude, self.grid.longitude),
            ("depth", depth_m, self.grid.depth),
            ("time", time_s, self.grid.time),
        ):
            if extent.contains(value):
                continue
            raise OutOfDomainError(
                f"{axis} {value:.6g} is outside [{extent.minimum:.6g}, {extent.maximum:.6g}]; "
                "outside the domain the analytic form is still arithmetic but is no longer "
                "the world this manifest describes",
                axis=axis,
                value=value,
            )

    # Evaluation --------------------------------------------------------------------

    def at(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Truth:
        """The truth at a point. ``time_s`` is seconds from the manifest's time origin."""
        self._require_domain(latitude, longitude, depth_m, time_s)
        return self._at(latitude, longitude, depth_m, time_s)

    def _at(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Truth:
        temperature, salinity = compose(
            self.background, self.features, latitude, longitude, depth_m, time_s
        )
        return Truth(
            temperature_c=temperature,
            salinity_psu=salinity,
            pressure_dbar=self.pressure.at(depth_m),
            # ADR-0005: derived at the point of use, by the one implementation in drogna.
            # Range checking is off because the generator checks the whole field once and
            # records the answer in the manifest, rather than raising per point.
            sound_speed_m_s=sound_speed(temperature, salinity, depth_m, check_range=False),
            decorrelation_timescale_s=self.timescale.evaluate(
                latitude, longitude, depth_m, time_s
            ),
        )

    def timescale_at(
        self, latitude: float, longitude: float, depth_m: float, time_s: float
    ) -> float:
        """The decorrelation timescale alone, for a consumer that wants only that."""
        self._require_domain(latitude, longitude, depth_m, time_s)
        return self.timescale.evaluate(latitude, longitude, depth_m, time_s)

    @property
    def sound_speed_method(self) -> str:
        """The named equation, so a residual computed elsewhere can say which one it used."""
        return EQUATION
