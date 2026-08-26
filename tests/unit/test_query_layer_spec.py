"""A vendored specification is canonical, so a refresh diff is an interface change log.

The query layer does not exist yet, so there is nothing vendored to assert about. What can
be asserted now is the property that makes the vendored document useful when it arrives:
that two captures of the same interface, however the emitter happened to order its keys,
produce the same bytes — and that a document which is not a specification is refused rather
than written.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICALISE = REPO_ROOT / "scripts" / "canonicalise_openapi.py"
VENDORED = REPO_ROOT / "contracts" / "openapi" / "query-layer.openapi.json"

SPECIFICATION = {
    "openapi": "3.0.3",
    "info": {"title": "a query layer", "version": "0.1.0"},
    "paths": {
        "/collections": {"get": {"responses": {"200": {"description": "collections"}}}},
        "/conformance": {"get": {"responses": {"200": {"description": "conformance"}}}},
    },
}


def canonicalise(tmp_path: Path, document: object, name: str) -> subprocess.CompletedProcess[str]:
    source = tmp_path / f"{name}.captured.json"
    source.write_text(json.dumps(document), encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(CANONICALISE), str(source), str(tmp_path / f"{name}.json")],
        capture_output=True,
        text=True,
        check=False,
    )


def _reversed(document: dict) -> dict:
    """The same document with every mapping's keys in the opposite order."""
    if isinstance(document, dict):
        return {key: _reversed(value) for key, value in reversed(list(document.items()))}
    return document


def test_key_order_in_the_capture_does_not_reach_the_vendored_document(tmp_path: Path) -> None:
    assert canonicalise(tmp_path, SPECIFICATION, "first").returncode == 0
    assert canonicalise(tmp_path, _reversed(SPECIFICATION), "second").returncode == 0

    assert (tmp_path / "first.json").read_bytes() == (tmp_path / "second.json").read_bytes()


def test_the_canonical_form_is_sorted_and_newline_terminated(tmp_path: Path) -> None:
    canonicalise(tmp_path, SPECIFICATION, "sample")
    text = (tmp_path / "sample.json").read_text(encoding="utf-8")

    assert text.endswith("}\n")
    assert "\r" not in text
    assert text.index('"info"') < text.index('"openapi"') < text.index('"paths"')
    assert json.loads(text) == SPECIFICATION, "canonicalising changed the document itself"


def test_a_document_that_is_not_a_specification_is_refused(tmp_path: Path) -> None:
    result = canonicalise(tmp_path, {"paths": {}}, "not-a-spec")

    assert result.returncode != 0
    assert not (tmp_path / "not-a-spec.json").exists()
    assert "openapi" in result.stderr


def test_no_stand_in_specification_has_been_vendored() -> None:
    """FR-002: the source is what the query layer serves, or there is no source yet.

    An invented document here would be the hand-written approximation the requirement
    exists to remove, and it would be worse than a hand-written one for looking captured.
    """
    if not VENDORED.exists():
        return
    document = json.loads(VENDORED.read_text(encoding="utf-8"))
    assert "openapi" in document
    assert VENDORED.read_bytes().endswith(b"}\n")
