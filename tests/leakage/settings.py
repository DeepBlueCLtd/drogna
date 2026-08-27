"""Where the leakage gate gets its numbers, and why they are not in test source.

Four values decide what the gate says: the identification radius, the released quantisation
step, the chance bound and the discovery bound. None of them is a constant here.

The first two are **release policy**. They live in ``config/<destination>/proxy.json`` under
``proxy``, beside the released collection list and the released variable allow-list, because
they are decisions about what a release discloses and they belong with the other ones. The
gate reads the same file the boundary is rendered from, so a deployment that widened its
identification radius cannot leave the gate testing against the old one.

The last two are **test configuration** and live in ``rules/bounds.yaml``, because they are
statements about the power of a test rather than about a deployment.

A note on the second name. The specification spells the discovery bound with a word
Constitution V forbids across every tracked file, and ``scripts/check_forbidden_vocabulary.py``
refuses it — including inside the sentence explaining why it is not used, which is why this
one is written the long way round. The value means exactly what the specification's bound
means.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RULES = Path(__file__).resolve().parent / "rules"
DESTINATIONS = REPOSITORY_ROOT / "config"

DEFAULT_DESTINATION = "local"

__all__ = [
    "DEFAULT_DESTINATION",
    "DESTINATIONS",
    "Settings",
    "destination_names",
    "load_settings",
    "release_policy",
]


@dataclass(frozen=True)
class Settings:
    """Everything the gate needs, and where each value came from."""

    destination: str
    identification_radius_m: float
    quantisation_step: float
    released_collections: tuple[str, ...]
    released_variables: tuple[str, ...]
    chance_bound: float
    discovery_bound: float

    def as_document(self) -> dict[str, object]:
        return {
            "destination": self.destination,
            "identification_radius_m": self.identification_radius_m,
            "quantisation_step": self.quantisation_step,
            "released_collections": list(self.released_collections),
            "released_variables": list(self.released_variables),
            "chance_bound": self.chance_bound,
            "discovery_bound": self.discovery_bound,
        }


def destination_names() -> tuple[str, ...]:
    return tuple(
        sorted(entry.name for entry in DESTINATIONS.iterdir() if (entry / "proxy.json").is_file())
    )


def release_policy(destination: str = DEFAULT_DESTINATION) -> dict:
    """The proxy's own configuration for a destination — the release policy, read whole."""
    return json.loads((DESTINATIONS / destination / "proxy.json").read_text(encoding="utf-8"))[
        "proxy"
    ]


def load_settings(destination: str = DEFAULT_DESTINATION, *, rules: Path = RULES) -> Settings:
    policy = release_policy(destination)
    bounds = yaml.safe_load((rules / "bounds.yaml").read_text(encoding="utf-8"))
    return Settings(
        destination=destination,
        identification_radius_m=float(policy["identification_radius_m"]),
        quantisation_step=float(policy["quantisation_step"]),
        released_collections=tuple(policy["released"]["collections"]),
        released_variables=tuple(policy["released"]["variables"]),
        chance_bound=float(bounds["chance_bound"]),
        discovery_bound=float(bounds["discovery_bound"]),
    )
