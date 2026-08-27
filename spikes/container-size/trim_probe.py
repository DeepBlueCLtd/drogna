#!/usr/bin/env python3
"""Spike code — throwaway. Not imported by drogna and not promoted into it.

The load-bearing check of this spike: pygeoapi and both of drogna's providers load with
rasterio and SQLAlchemy absent.

Why it needs proving rather than asserting. pygeoapi declares both in its own metadata, so
removing them makes the installed tree one that pip would call broken. What makes that
survivable here is that pygeoapi loads providers by dotted module path at request time —
`query/pygeoapi-config.yaml.template` names `plugins.edr_trajectory` and
`plugins.sensorthings_provider` and nothing else — so the providers that would import
rasterio are never reached. That is a claim about a lazy import, and a claim about a lazy
import is exactly the kind that is true until the day the framework changes and then fails
in a running container rather than in a build.

So this asserts the two things that have to hold together:

  1. rasterio and SQLAlchemy really are absent — otherwise the probe proves nothing.
  2. pygeoapi, its EDR and provider machinery, and both drogna providers import anyway.

Written to run under pytest as well as on its own, so it can become a build-time check in
the image the way `query-layer-pin-check.py` already is. Point it at a trimmed environment:

    PYTHONPATH=query <trimmed-venv>/bin/python spikes/container-size/trim_probe.py
"""

from __future__ import annotations

import importlib
import sys

REMOVED = ("rasterio", "sqlalchemy")

# Every pygeoapi surface drogna's two providers actually stand on. If a future pygeoapi
# moves one of these behind a rasterio import, this list is where it is caught.
REQUIRED_PYGEOAPI = (
    "pygeoapi",
    "pygeoapi.api",
    "pygeoapi.plugin",
    "pygeoapi.provider.base",
    "pygeoapi.provider.base_edr",
)

DROGNA_PROVIDERS = (
    ("plugins.edr_trajectory", "DrognaTrajectoryEDRProvider"),
    ("plugins.sensorthings_provider", "DrognaSensorThingsProvider"),
)


def assert_absent() -> None:
    """The premise. A probe run against an untrimmed environment proves nothing."""
    for name in REMOVED:
        try:
            importlib.import_module(name)
        except ImportError:
            continue
        raise AssertionError(
            f"{name} is still installed; this probe only means something against a "
            "trimmed environment"
        )


def assert_pygeoapi_loads() -> None:
    for name in REQUIRED_PYGEOAPI:
        importlib.import_module(name)


def assert_providers_load() -> None:
    """The providers the pygeoapi configuration actually names, by dotted path."""
    for module_name, class_name in DROGNA_PROVIDERS:
        module = importlib.import_module(module_name)
        provider = getattr(module, class_name, None)
        if provider is None:
            raise AssertionError(f"{module_name} has no {class_name}")


def test_pygeoapi_loads_without_rasterio_or_sqlalchemy() -> None:
    assert_absent()
    assert_pygeoapi_loads()
    assert_providers_load()


def main() -> int:
    checks = (
        ("rasterio and SQLAlchemy are absent", assert_absent),
        ("pygeoapi and its provider machinery import", assert_pygeoapi_loads),
        ("both drogna providers import", assert_providers_load),
    )
    failed = False
    for description, check in checks:
        try:
            check()
        except Exception as error:
            print(f"FAIL  {description}: {type(error).__name__}: {error}")
            failed = True
        else:
            print(f"ok    {description}")
    if not failed:
        print("\nThe query image can drop both packages.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
