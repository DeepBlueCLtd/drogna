"""The seam between the publisher and the query layer, exercised from both ends at once.

Features 008 and 009 meet at the coverage store and nowhere else. The publisher writes runs
into it; the query layer reads them out. Neither imports the other, which is deliberate —
``stores/coverage/layout.md`` is the contract and a shared module would let the contract be
changed by accident. What that costs is a whole class of failure no test on either side can
see: the two ends can agree on nothing at all and both suites stay green, because each one
proves only that it obeys its own idea of the layout.

That is what happened. The publisher wrote its runs at the store root under a ``run_``
prefix, put a symlink where the pointer belongs and called the manifest ``run.json``; the
query layer looked under ``runs/``, read the pointer as text and wanted ``run-manifest.json``.
Every published run was invisible to the read path — the whole output of the control loop,
serving nothing — and forty-odd passing tests said otherwise. The pointer alone made it
unfixable by renaming: a symlink to a directory cannot be read as text, so the two ends
could not have met however the names were spelled.

So this test publishes through :class:`PublisherService` — the publisher's own code path,
not a re-statement of it — and resolves through :class:`CoverageCatalogue`, which is the
query layer's only implementation of the convention and the one its EDR provider serves
from. Neither end is stood in for. Both are configured from the destination configuration
files themselves, rebased onto a temporary directory, so a value that drifts in one file and
not the other fails here rather than on the droplet.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "query", REPO_ROOT / "stores" / "coverage"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import validate_layout  # noqa: E402
from control_loop import manual_clock  # noqa: E402
from harness_publisher.service import PublisherService  # noqa: E402
from harness_types.config.publisher import DrognaPublisherConfiguration  # noqa: E402
from plugins.coverage_catalogue import (  # noqa: E402
    CoverageCatalogue,
    StoreLayout,
    derive_run_id,
)
from plugins.errors import CatalogueError  # noqa: E402
from publisher_support import stage_run  # noqa: E402

DESTINATIONS = ("local", "droplet")


def document(destination: str, component: str) -> dict:
    path = REPO_ROOT / "config" / destination / f"{component}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def identifier(destination: str, sequence: int) -> str:
    """A run identifier by the store's own rule, from the destination's own values.

    The publisher does not import ``derive_run_id`` and neither does this helper on its
    behalf: what is asserted below is that a run named by this rule is the run the catalogue
    resolves, which is the agreement the layout asks for.
    """
    store = document(destination, "query")["query"]["coverage_store"]
    return derive_run_id(
        root_seed=int(document(destination, "publisher")["seed"]["root"]),
        run_sequence=sequence,
        rule=str(store["run_id"]["rule"]),
        version=int(store["run_id"]["version"]),
        prefix=str(store["run_id"]["prefix"]),
    )


def publisher_for(tmp_path: Path, destination: str = "local") -> PublisherService:
    """The publisher a destination configures, writing into this test's own directories."""
    settings = document(destination, "publisher")
    settings["publisher"]["staging"]["directory"] = str(tmp_path / "staging")
    settings["publisher"]["catalogue"]["root_directory"] = str(tmp_path / "coverage")
    (tmp_path / "coverage").mkdir(parents=True, exist_ok=True)
    return PublisherService(
        DrognaPublisherConfiguration.model_validate(settings), clock=manual_clock()
    )


def layout_for(tmp_path: Path, destination: str = "local") -> StoreLayout:
    """The layout a destination configures for the query layer, over the same directory."""
    store = dict(document(destination, "query")["query"]["coverage_store"])
    store["root"] = str(tmp_path / "coverage")
    return StoreLayout.from_config(store)


def publish(tmp_path: Path, *sequences: int, destination: str = "local") -> list[str]:
    """Publish runs through the publisher, in order, and hand back their identifiers."""
    service = publisher_for(tmp_path, destination)
    published: list[str] = []
    for sequence in sequences:
        run_id = identifier(destination, sequence)
        stage_run(tmp_path / "staging", run_id, body=f"field {sequence}".encode())
        assert service.take(run_id) is not None, f"the publisher refused {run_id}"
        published.append(run_id)
    return published


# --------------------------------------------------------------------- the seam itself


def test_a_published_run_is_the_run_the_query_layer_resolves(tmp_path: Path) -> None:
    """The one assertion this whole file exists for: publish, then read, and get the run.

    It fails if the two ends disagree about where the run directory is, about what the
    manifest is called or what it must contain, or about how the pointer is written —
    ``current()`` needs all three, because it resolves the pointer to a run that has been
    catalogued, and cataloguing needs the directory and a readable manifest.
    """
    [run_id] = publish(tmp_path, 0)

    catalogue = CoverageCatalogue(layout_for(tmp_path))

    assert catalogue.current().run_id == run_id


def test_the_run_directory_is_where_the_query_layer_looks_for_it(tmp_path: Path) -> None:
    [run_id] = publish(tmp_path, 0)
    layout = layout_for(tmp_path)

    assert layout.run_directory(run_id).is_dir()
    assert CoverageCatalogue(layout).identifiers() == [run_id]


def test_the_manifest_is_under_the_name_the_query_layer_reads(tmp_path: Path) -> None:
    """And it holds what the layout requires, not what staging happened to leave behind."""
    [run_id] = publish(tmp_path, 0)
    layout = layout_for(tmp_path)

    manifest = json.loads(
        (layout.run_directory(run_id) / layout.manifest_file).read_text(encoding="utf-8")
    )

    assert manifest["run_id"] == run_id
    assert manifest["run_sequence"] == 0
    assert manifest["root_seed"] == document("local", "publisher")["seed"]["root"]
    assert CoverageCatalogue(layout).entry(run_id).manifest == manifest


def test_the_pointer_is_a_text_file_holding_one_identifier(tmp_path: Path) -> None:
    """The divergence that could never have been fixed by renaming.

    A symlink to the run's directory cannot be read as text: the read fails rather than
    returning a name, so no spelling of the names would have joined the two ends. This
    asserts the shape and not only the outcome, because the outcome has other ways of
    being right and this one property is what the query layer depends on.
    """
    [run_id] = publish(tmp_path, 0)
    pointer = layout_for(tmp_path).pointer_path

    assert not pointer.is_symlink()
    assert pointer.read_text(encoding="utf-8").splitlines() == [run_id]


def test_the_store_the_publisher_wrote_passes_the_query_layers_own_validator(
    tmp_path: Path,
) -> None:
    """008's checker, over 009's output. It reports every fault, so this names any of them."""
    publish(tmp_path, 0, 1)

    assert validate_layout.check_store(layout_for(tmp_path)) == []


def test_publishing_a_second_run_moves_the_pointer_and_keeps_the_first(
    tmp_path: Path,
) -> None:
    """FR-015: comparing two runs is the point of keeping them, so only the pointer moves."""
    first, second = publish(tmp_path, 0, 1)
    catalogue = CoverageCatalogue(layout_for(tmp_path))

    assert catalogue.current().run_id == second
    assert catalogue.identifiers() == sorted((first, second))
    assert catalogue.entry(first).manifest["run_sequence"] == 0
    assert not catalogue.is_current(first)


def test_a_refused_run_leaves_the_query_layer_reading_the_previous_one(
    tmp_path: Path,
) -> None:
    """FR-026 from the reading end: a run that never became visible never became current."""
    [good] = publish(tmp_path, 0)
    service = publisher_for(tmp_path)
    bad = identifier("local", 1)
    stage_run(tmp_path / "staging", bad, truncate_forecast=True)

    assert service.take(bad) is None

    catalogue = CoverageCatalogue(layout_for(tmp_path))
    assert catalogue.current().run_id == good
    assert catalogue.identifiers() == [good]


def test_an_empty_store_reports_that_no_run_is_current(tmp_path: Path) -> None:
    """The starting state, asserted so that "nothing resolves" is a message and not a crash."""
    (tmp_path / "coverage").mkdir(parents=True)

    with pytest.raises(CatalogueError):
        CoverageCatalogue(layout_for(tmp_path)).current()


# ------------------------------------------------------ the configurations, before any I/O


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_both_ends_of_each_destination_name_one_store(destination: str) -> None:
    """The cheap half of the same check: the two files agree before anything is written.

    Rebasing the root onto a temporary directory, as the tests above do, is what makes them
    runnable — and it is also what would let the configured roots drift apart unnoticed. So
    the configured values are compared directly, here, at both destinations.
    """
    catalogue = document(destination, "publisher")["publisher"]["catalogue"]
    store = document(destination, "query")["query"]["coverage_store"]

    assert catalogue["root_directory"] == store["root"]
    assert catalogue["current_pointer"] == store["current_pointer"]
    assert catalogue["forecast_file"] == store["forecast_file"]
    assert catalogue["uncertainty_file"] == store["uncertainty_file"]
    assert catalogue["manifest_file"] == store["manifest_file"]
    assert catalogue["runs_dirname"] == store["runs_dirname"]
    assert catalogue["partial_suffix"] == store["partial_suffix"]
    # And the third statement of that suffix, in the component that stages under it. The
    # value is written into three configuration files because no component reads another's,
    # which is exactly why the three are compared here rather than trusted.
    assert (
        document(destination, "model_runner")["model_runner"]["staging"]["partial_suffix"]
        == (store["partial_suffix"])
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_both_ends_of_each_destination_derive_the_same_identifiers(destination: str) -> None:
    """One root seed, so one set of run names. Two would make a replay undiffable."""
    assert (
        document(destination, "publisher")["seed"]["root"]
        == document(destination, "query")["seed"]["root"]
    )
    assert (
        document(destination, "scheduler")["seed"]["root"]
        == (document(destination, "query")["seed"]["root"])
    )
    # The scheduler names the runs and the query layer resolves them, and neither imports
    # the other's implementation of the rule. What makes the two agree is that they are
    # given the same five values, so the three that are configuration are compared here.
    assert (
        document(destination, "scheduler")["scheduler"]["run_id"]
        == document(destination, "query")["query"]["coverage_store"]["run_id"]
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_every_served_parameter_names_a_variable_a_run_actually_holds(destination: str) -> None:
    """The seam the store's two ends had never met across, and 008 T062's other half.

    The query layer's parameter list named `sea_water_temperature`, `sea_water_practical_
    salinity`, `sea_water_pressure` and `sea_water_temperature_uncertainty`. The model runner
    writes `temperature` and `salinity` into the forecast field and `temperature_spread` and
    `salinity_spread` into the uncertainty field; it has never written a pressure, and
    ADR-0005's argument for not storing sound speed applies to pressure for the same reason.
    Both sides were self-consistent — 008's own tests build a NetCDF with the names 008's
    configuration expects — and no run had ever been published, so nothing crossed and
    nothing noticed. The first real cube served answered 400: "run-000000-7f80b47c7b91
    forecast carries no variable named 'sea_water_temperature'".

    The names the runner writes are held in `harness_model_runner.staging` and read by
    `harness_monitor.coverage.FORECAST_VARIABLES`, which an integration test already keeps in
    step. This adds the third reader: what a destination advertises as servable.
    """
    written = {
        "forecast": set(runner_variables("forecast")),
        "uncertainty": set(runner_variables("uncertainty")),
    }
    for parameter in document(destination, "query")["query"]["coverage"]["parameters"]:
        source = parameter["source"]
        assert parameter["variable"] in written[source], (
            f"{destination} advertises {parameter['name']!r} over {source} variable "
            f"{parameter['variable']!r}, which no published run carries; the runner writes "
            f"{sorted(written[source])}"
        )


def runner_variables(source: str) -> tuple[str, ...]:
    """The variables the model runner puts in each of a run's two fields.

    Read out of a real staged run rather than restated here, so this test cannot pass against
    a set of names the component stopped writing.
    """
    from pathlib import Path
    from tempfile import TemporaryDirectory

    from control_loop import PARTIAL_SUFFIX, manual_clock, model_runner_document
    from harness_core.netcdf import read_netcdf
    from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
    from harness_model_runner.staging import Staging
    from harness_types.config.model_runner import DrognaModelRunnerConfiguration
    from runner_support import ground_truth, run_request

    with TemporaryDirectory() as scratch:
        staging = Path(scratch) / "staging"
        runner = ModelRunnerService(
            DrognaModelRunnerConfiguration.model_validate(model_runner_document(step_count=2)),
            clock=manual_clock(),
            ground_truth=ground_truth(),
            staging=Staging(
                staging,
                forecast_file="forecast.nc",
                uncertainty_file="uncertainty.nc",
                manifest_file="run.json",
                partial_suffix=PARTIAL_SUFFIX,
            ),
        )
        staged = runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-variable-census"))
        assert staged is not None
        name = "forecast.nc" if source == "forecast" else "uncertainty.nc"
        dataset = read_netcdf((staged.directory / name).read_bytes())
        return tuple(dataset.variables)
