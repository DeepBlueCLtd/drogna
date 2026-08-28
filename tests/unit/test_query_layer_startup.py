"""The query layer is handed a configuration this repository wrote, or it does not start.

`deploy/images/query-layer.Dockerfile` ended `ENTRYPOINT ["pygeoapi", "serve"]`, and the
Compose service passed `HARNESS_CONFIG` and nothing else — which is what every drogna
component gets, and what pygeoapi does not read. So the image asked a server to serve a
configuration nothing had produced, and got as far as importing its own Flask app before
saying so:

    RuntimeError: PYGEOAPI_CONFIG environment variable not set

`query/render_config.py` and `query/pygeoapi-config.yaml.template` had existed since 008
landed with nothing calling them. Nobody found it because both destinations started the
observation store alone until the active profiles were widened, so no bring-up had ever
reached this image.

pygeoapi 0.20 refuses twice and separately, which is why both are asserted here: `get_config`
raises when PYGEOAPI_CONFIG is unset, and `load_openapi_document` raises when
PYGEOAPI_OPENAPI is unset and raises again when it names a file that is not there — "Please
generate before starting pygeoapi". A fix for the first walks straight into the second.

The last line has since changed once more. `pygeoapi serve` starts the server and nothing
else, so C-09's heartbeat — written in 008 and never constructed — stayed unconstructed and
its box in the client stayed grey while the component answered every request put to it. The
entrypoint now execs `query/serve.py`, which starts the heartbeat and then runs pygeoapi's
own application. These tests name that module rather than `pygeoapi serve`, so a return to
the bare server fails here instead of quietly going dark.
"""

from __future__ import annotations

from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ENTRYPOINT = REPOSITORY_ROOT / "deploy" / "images" / "query-layer-entrypoint.sh"
DOCKERFILE = REPOSITORY_ROOT / "deploy" / "images" / "query-layer.Dockerfile"

# What the entrypoint hands control to. Named, not located: the directory it sits in is the
# repository root the image copies, and these tests care which program runs rather than where.
SERVER_MODULE = "serve.py"


def _instructions(path: Path) -> str:
    """The Dockerfile with its commentary removed.

    The header explains what used to stand here by quoting it, so a search of the whole file
    finds the instruction in the prose describing its removal. What the image does is the
    lines that are not comments.
    """
    return "\n".join(
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("#")
    )


def test_the_image_does_not_exec_pygeoapi_without_rendering_first() -> None:
    """The line that shipped, named so that returning to it fails rather than deploys."""
    body = _instructions(DOCKERFILE)
    assert 'ENTRYPOINT ["pygeoapi", "serve"]' not in body, (
        "the query image execs pygeoapi directly again. Nothing has rendered its "
        "configuration by then, and it exits 1 with PYGEOAPI_CONFIG not set"
    )
    assert ENTRYPOINT.name in body, "the image must start through the entrypoint that renders"


def test_the_entrypoint_renders_before_it_serves() -> None:
    body = ENTRYPOINT.read_text(encoding="utf-8")
    rendered = body.index("render_config.py")
    served = body.index(SERVER_MODULE)
    assert rendered < served, (
        "the configuration must be rendered before the server is started, not after: "
        "pygeoapi reads it at import time, before it serves anything"
    )


def test_the_entrypoint_starts_the_module_that_announces_the_component() -> None:
    """The bare server, named so that returning to it fails rather than goes dark.

    `pygeoapi serve` is `APP.run(...)` and nothing else. Exec it here and the query layer
    serves perfectly and is never heard from, which the client can only draw as a component
    that is not there — the one thing the illumination display exists to be truthful about.
    """
    body = ENTRYPOINT.read_text(encoding="utf-8")
    assert "exec pygeoapi serve" not in body, (
        "the entrypoint execs the bare server again, so nothing constructs C-09's heartbeat "
        "and its box stays grey while it answers every request put to it"
    )
    assert f"exec python3 ./query/{SERVER_MODULE}" in body


def test_the_entrypoint_sets_both_variables_pygeoapi_refuses_to_start_without() -> None:
    body = ENTRYPOINT.read_text(encoding="utf-8")
    for variable in ("PYGEOAPI_CONFIG", "PYGEOAPI_OPENAPI"):
        assert f"export {variable}" in body or f" {variable}" in body.split("export", 1)[-1], (
            f"{variable} is never exported. pygeoapi 0.20 raises on it being unset and the "
            "container exits before serving anything"
        )


def test_the_entrypoint_generates_the_openapi_document_it_points_at() -> None:
    """Setting PYGEOAPI_OPENAPI is half of it; the file it names has to exist.

    "OpenAPI document {} does not exist. Please generate before starting pygeoapi" — a path
    nobody wrote fails exactly as loudly as no path at all, one step later.
    """
    body = ENTRYPOINT.read_text(encoding="utf-8")
    assert "pygeoapi openapi generate" in body, (
        "nothing generates the OpenAPI document, so PYGEOAPI_OPENAPI names a file that does "
        "not exist and pygeoapi refuses to start"
    )
    assert SERVER_MODULE in body


def test_a_failed_generation_stops_the_container_rather_than_serving_anyway() -> None:
    """The proxy's shape: a surface nobody could describe is not a surface to publish."""
    body = ENTRYPOINT.read_text(encoding="utf-8")
    assert "exit 1" in body, (
        "the entrypoint must fail when the OpenAPI document cannot be generated. Serving "
        "anyway publishes a description that disagrees with the configuration behind it"
    )
    assert "set -eu" in body, "an unchecked failure earlier in the script must stop it too"
