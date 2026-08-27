"""The glossary gate, watched failing on each thing it claims to catch.

A check that has never been seen to fail is worth nothing, so every rule this gate
enforces has a fixture here that violates it and an assertion that the violation is
reported, named and counted. The clean fixture is the control on the other side: if the
gate reports a finding on it, the gate has become over-eager rather than the site having
become wrong.

The fixtures are built HTML rather than markdown, because the gate reads the built site
and the failure mode most worth guarding against is a rule that is right about markdown
and wrong about what the theme emits.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

GATE_DIR = Path(__file__).resolve().parents[1]
if str(GATE_DIR) not in sys.path:
    sys.path.insert(0, str(GATE_DIR))

import check_glossary as gate  # noqa: E402

GLOSSARY_HEAD = """<!doctype html><html><body><article class="md-content__inner md-typeset">
<h1>Glossary</h1>
"""


def glossary_html(anchors: list[str]) -> str:
    body = "\n".join(f'<h2 id="{anchor}">{anchor}</h2><p>A definition.</p>' for anchor in anchors)
    return GLOSSARY_HEAD + body + "</article></body></html>"


ALL_ANCHORS = [term.anchor for term in gate.TERMS]


def page(body: str) -> str:
    return (
        '<!doctype html><html><body><header><a href="../glossary/#front">Glossary</a></header>'
        '<article class="md-content__inner md-typeset">' + body + "</article></body></html>"
    )


@pytest.fixture
def site(tmp_path: Path) -> Path:
    """A built site with a complete glossary and one ordinary page directory."""
    root = tmp_path / "build"
    (root / "glossary").mkdir(parents=True)
    (root / "glossary" / "index.html").write_text(glossary_html(ALL_ANCHORS), encoding="utf-8")
    (root / "topic").mkdir()
    return root


def write(site: Path, body: str) -> None:
    (site / "topic" / "index.html").write_text(page(body), encoding="utf-8")


def run(site: Path, capsys) -> tuple[int, list[str]]:
    code = gate.main(["--site", str(site), "--manifest", str(site / "no-such-manifest.yaml")])
    lines = capsys.readouterr().out.strip().splitlines()
    return code, lines


# --- the shape of the output the runner contract fixes -----------------------------


def test_a_clean_site_exits_zero_and_says_so(site: Path, capsys) -> None:
    write(site, '<p>A page that mentions <a href="../glossary/#advection">advection</a>.</p>')

    code, lines = run(site, capsys)

    assert code == 0
    assert lines[-1] == "glossary: 0 findings"


def test_every_finding_line_carries_path_line_rule_and_message(site: Path, capsys) -> None:
    write(site, "<p>Sampling along a trajectory.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert lines[-1] == "glossary: 1 findings"
    path, line, rest = lines[0].split(":", 2)
    assert path == "topic/index.html"
    assert line == "-" or line.isdigit()
    rule, message = rest.strip().split(":", 1)
    assert rule == gate.UNLINKED
    assert message.strip()


# --- direction one: a term on the source list with no definition --------------------


def test_a_source_list_term_with_no_definition_is_reported_and_named(site: Path, capsys) -> None:
    """The seeded violation: remove one definition and watch the gate name it."""
    missing = "orienteering"
    remaining = [anchor for anchor in ALL_ANCHORS if anchor != missing]
    (site / "glossary" / "index.html").write_text(glossary_html(remaining), encoding="utf-8")
    write(site, "<p>Nothing to see.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    reported = [line for line in lines if gate.UNDEFINED in line]
    assert len(reported) == 1
    assert "glossary/index.html" in reported[0]
    assert missing in reported[0]
    assert "'orienteering'" in reported[0]


def test_an_undefined_term_is_reported_once_and_not_again_per_page(site: Path, capsys) -> None:
    """Otherwise one missing entry buries the other direction under a finding per page."""
    remaining = [anchor for anchor in ALL_ANCHORS if anchor != "h3"]
    (site / "glossary" / "index.html").write_text(glossary_html(remaining), encoding="utf-8")
    write(site, "<p>Indexed with H3, and H3 again.</p>")

    _, lines = run(site, capsys)

    assert len([line for line in lines if "h3" in line]) == 1


# --- direction two: a first use that does not link ----------------------------------


def test_a_use_with_no_link_anywhere_is_reported(site: Path, capsys) -> None:
    write(site, "<p>The water is churning through a sharp front.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert any(gate.UNLINKED in line and "front" in line for line in lines)


def test_a_link_after_the_first_use_is_reported_as_being_after_it(site: Path, capsys) -> None:
    write(
        site,
        '<p>A sharp front matters.</p><p>Defined under <a href="../glossary/#front">front</a>.</p>',
    )

    code, lines = run(site, capsys)

    assert code == 1
    assert any("before the page's link" in line for line in lines)


def test_a_link_at_the_first_use_passes(site: Path, capsys) -> None:
    write(site, '<p>A sharp <a href="../glossary/#front">front</a>, then more fronts.</p>')

    code, _ = run(site, capsys)

    assert code == 0


def test_a_link_earlier_on_the_page_than_the_first_bare_use_passes(site: Path, capsys) -> None:
    """ "At or before", not "exactly on": a page that has introduced the term has served
    the reader, and demanding the very first occurrence carry the link fails good pages
    for word order."""
    write(
        site,
        '<p>See <a href="../glossary/#front">the glossary</a>.</p><p>A sharp front.</p>',
    )

    code, _ = run(site, capsys)

    assert code == 0


def test_a_multi_word_term_split_across_a_line_is_still_a_use(site: Path, capsys) -> None:
    """The quietest way for this gate to report clean is to miss the hard-wrapped half."""
    write(site, "<p>The residual is computed on sound\nspeed, not temperature.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert any("sound speed" in line for line in lines)


# --- the scoping decisions, each with the thing it must not report -------------------


def test_a_term_inside_code_is_not_a_use(site: Path, capsys) -> None:
    write(site, "<p>Run <code>check_front.py</code> and <pre>front = 1</pre>.</p>")

    code, _ = run(site, capsys)

    assert code == 0


def test_a_term_in_a_heading_is_not_a_use(site: Path, capsys) -> None:
    write(site, "<h2>Advection</h2><p>Nothing else here.</p>")

    code, _ = run(site, capsys)

    assert code == 0


def test_theme_chrome_outside_the_article_is_not_a_use(site: Path, capsys) -> None:
    """The header in `page()` links the glossary and every page carries a navigation
    column; if either counted, every page would pass or fail for the theme."""
    body = "<p>Nothing.</p>"
    (site / "topic" / "index.html").write_text(
        "<!doctype html><html><body><nav><p>advection and fronts and trajectories</p></nav>"
        '<article class="md-content__inner md-typeset">' + body + "</article></body></html>",
        encoding="utf-8",
    )

    code, _ = run(site, capsys)

    assert code == 0


def test_a_blog_excerpt_is_not_checked_where_it_is_repeated(site: Path, capsys) -> None:
    (site / "blog").mkdir()
    (site / "blog" / "index.html").write_text(
        '<!doctype html><html><body><article class="md-content__inner md-typeset">'
        "<p>The blog.</p>"
        '<article class="md-post md-post--excerpt"><p>Through a sharp front.</p></article>'
        "</article></body></html>",
        encoding="utf-8",
    )
    write(site, "<p>Nothing.</p>")

    code, _ = run(site, capsys)

    assert code == 0


def test_a_declared_phrase_in_the_other_sense_is_not_a_use(site: Path, capsys) -> None:
    write(site, "<p>Every entry carries front matter, and a Compose profile chooses.</p>")

    code, _ = run(site, capsys)

    assert code == 0


def test_the_declared_phrase_does_not_blind_the_gate_to_the_real_sense(site: Path, capsys) -> None:
    """The control on the exemption: an excluded phrase must not swallow a genuine use."""
    write(site, "<p>Every entry carries front matter, and the water crosses a front.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert any("front" in line for line in lines)


def test_the_glossary_page_is_not_checked_against_itself(site: Path, capsys) -> None:
    """Its entries are the definitions and its cross-references are same-page anchors."""
    write(site, "<p>Nothing.</p>")

    code, _ = run(site, capsys)

    assert code == 0


# --- exit code 2: could not run, with the reason named -------------------------------


def test_a_missing_site_directory_exits_two_and_names_it(tmp_path: Path, capsys) -> None:
    absent = tmp_path / "never-built"

    code = gate.main(["--site", str(absent)])
    out = capsys.readouterr().out

    assert code == 2
    assert "cannot run" in out
    assert str(absent) in out


def test_a_site_without_a_glossary_page_exits_two_and_names_it(tmp_path: Path, capsys) -> None:
    root = tmp_path / "build"
    root.mkdir()
    (root / "index.html").write_text(page("<p>Nothing.</p>"), encoding="utf-8")

    code = gate.main(["--site", str(root)])
    out = capsys.readouterr().out

    assert code == 2
    assert "cannot run" in out
    assert "glossary" in out


# --- the source list itself -----------------------------------------------------------


def test_the_source_list_covers_the_vocabulary_the_task_seeds_it_from() -> None:
    """T027 names fourteen concepts. A list that quietly shrank would pass everything."""
    expected = {
        "sound-speed",
        "thermocline",
        "front",
        "mesoscale-eddy",
        "decorrelation-timescale",
        "ensemble-spread",
        "persistence-forecast",
        "advection",
        "coverage",
        "trajectory",
        "profile",
        "discrete-sampling-geometry",
        "orienteering",
        "h3",
    }

    assert {term.anchor for term in gate.TERMS} == expected


def test_every_term_declares_at_least_one_form() -> None:
    for term in gate.TERMS:
        assert term.forms, f"{term.anchor} has no spelling to look for"
