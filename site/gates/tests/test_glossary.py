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

import shutil
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


# --- the fifth scoping decision: pages the site publishes but does not author ---------
#
# The exclusion is computed from the manifest and from the record files on disk, never
# listed. These tests are what makes widening it cost something: each one fails if the
# exclusion stops being exactly "the pages a record generated" and becomes "the pages
# that had findings".


RECORDS = ("0001-a-decision", "0002-another-decision")


def adr_site(tmp_path: Path) -> tuple[Path, Path, Path]:
    """A built site with generated record pages, the records they came from, a manifest.

    Every record page and the generated index use a glossary term and link none of them,
    which is the state the real site was in when this exclusion was argued.
    """
    repo = tmp_path / "repo"
    (repo / "docs" / "adr").mkdir(parents=True)
    for stem in RECORDS:
        (repo / "docs" / "adr" / f"{stem}.md").write_text(f"# {stem}\n", encoding="utf-8")

    root = tmp_path / "build"
    (root / "glossary").mkdir(parents=True)
    (root / "glossary" / "index.html").write_text(glossary_html(ALL_ANCHORS), encoding="utf-8")
    (root / "topic").mkdir()
    write(root, "<p>Nothing.</p>")

    area = root / "decisions" / "adr"
    area.mkdir(parents=True)
    area.joinpath("index.html").write_text(page("<p>A sharp front.</p>"), encoding="utf-8")
    for stem in RECORDS:
        (area / stem).mkdir()
        (area / stem / "index.html").write_text(
            page("<p>Sampling along a trajectory.</p>"), encoding="utf-8"
        )

    manifest = tmp_path / "manifest.yaml"
    manifest.write_text(
        "adrs:\n  published: true\n  source: docs/adr\n  destination: decisions\n",
        encoding="utf-8",
    )
    return root, manifest, repo


def run_with(site: Path, manifest: Path, repo: Path, capsys) -> tuple[int, list[str]]:
    code = gate.main(["--site", str(site), "--manifest", str(manifest), "--repo-root", str(repo)])
    return code, capsys.readouterr().out.strip().splitlines()


def test_a_page_generated_verbatim_from_a_record_is_out_of_scope(tmp_path: Path, capsys) -> None:
    root, manifest, repo = adr_site(tmp_path)

    code, lines = run_with(root, manifest, repo, capsys)

    assert code == 0, lines
    assert lines[-1] == "glossary: 0 findings"


def test_what_was_excluded_is_printed_even_on_a_clean_run(tmp_path: Path, capsys) -> None:
    """An exclusion nobody can see is an exemption; one printed every run is a scope."""
    root, manifest, repo = adr_site(tmp_path)

    _, lines = run_with(root, manifest, repo, capsys)

    printed = [line for line in lines if gate.NOT_AUTHORED in line]
    assert len(printed) == 1
    assert "decisions/adr" in printed[0]
    assert "docs/adr" in printed[0]
    assert str(len(RECORDS)) in printed[0]


def test_the_exclusion_is_the_records_on_disk_and_their_index_and_nothing_else(
    tmp_path: Path,
) -> None:
    """The narrowness, asserted as a set rather than described in a comment."""
    root, manifest, repo = adr_site(tmp_path)

    excluded = gate.generated_record_pages(root, manifest, repo).paths

    assert excluded == {"decisions/adr/index.html"} | {
        f"decisions/adr/{stem}/index.html" for stem in RECORDS
    }


def test_the_exclusion_follows_the_records_rather_than_this_gate(tmp_path: Path) -> None:
    """Retire a record and its page stops being excluded, without an edit here.

    The corollary is the one that matters: nothing can be added to the exclusion except
    by adding a decision record, which is not an act anyone performs by accident.
    """
    root, manifest, repo = adr_site(tmp_path)
    (repo / "docs" / "adr" / f"{RECORDS[0]}.md").unlink()
    shutil.rmtree(root / "decisions" / "adr" / RECORDS[0])

    excluded = gate.generated_record_pages(root, manifest, repo).paths

    assert excluded == {
        "decisions/adr/index.html",
        f"decisions/adr/{RECORDS[1]}/index.html",
    }


def test_a_page_no_record_generated_ends_the_exclusion_and_the_gate_says_why(
    tmp_path: Path, capsys
) -> None:
    """The premise is that the site authors nothing there. A page that breaks it ends it.

    This is the seeded violation for the scoping decision itself: without it, anything
    dropped into the published directory would inherit an exemption argued for records.
    """
    root, manifest, repo = adr_site(tmp_path)
    intruder = root / "decisions" / "adr" / "hand-written"
    intruder.mkdir()
    (intruder / "index.html").write_text(page("<p>Nothing.</p>"), encoding="utf-8")

    result = gate.generated_record_pages(root, manifest, repo)
    code, lines = run_with(root, manifest, repo, capsys)

    assert result.paths == frozenset()
    assert "hand-written" in result.note
    assert code == 1
    assert any("decisions/adr/index.html" in line and gate.UNLINKED in line for line in lines)
    assert any(gate.NOT_AUTHORED in line for line in lines)


def test_a_manifest_that_does_not_publish_the_records_excludes_nothing(
    tmp_path: Path, capsys
) -> None:
    root, manifest, repo = adr_site(tmp_path)
    manifest.write_text(
        "adrs:\n  published: false\n  source: docs/adr\n  destination: decisions\n",
        encoding="utf-8",
    )

    assert gate.generated_record_pages(root, manifest, repo).paths == frozenset()

    code, lines = run_with(root, manifest, repo, capsys)

    assert code == 1
    assert any("decisions/adr" in line for line in lines)


def test_no_manifest_at_all_excludes_nothing(tmp_path: Path) -> None:
    """Losing the manifest must narrow the gate's scope, never widen it."""
    root, _, repo = adr_site(tmp_path)

    absent = tmp_path / "no-such-manifest.yaml"

    assert gate.generated_record_pages(root, absent, repo).paths == frozenset()


def test_an_authored_page_is_still_checked_beside_the_excluded_ones(tmp_path: Path, capsys) -> None:
    """The control: scoping the records out must not quieten the site's own pages."""
    root, manifest, repo = adr_site(tmp_path)
    write(root, "<p>Sampling along a trajectory.</p>")

    code, lines = run_with(root, manifest, repo, capsys)

    assert code == 1
    assert any("topic/index.html" in line and "trajectory" in line for line in lines)


def test_a_hand_written_page_under_the_same_parent_is_not_excluded(tmp_path: Path, capsys) -> None:
    """`decisions/` holds hand-written pages about decisions. Only `decisions/adr/` is
    generated, and only the pages in it that a record produced."""
    root, manifest, repo = adr_site(tmp_path)
    (root / "decisions" / "site-tooling").mkdir()
    (root / "decisions" / "site-tooling" / "index.html").write_text(
        page("<p>A sharp front.</p>"), encoding="utf-8"
    )

    code, lines = run_with(root, manifest, repo, capsys)

    assert code == 1
    assert any("decisions/site-tooling/index.html" in line for line in lines)


def test_the_exclusion_matches_this_repository_s_own_records(tmp_path: Path) -> None:
    """Read against the real manifest and the real `docs/adr/`, not a fixture's copy.

    If the manifest stops publishing the records, or the records move, this fails rather
    than the gate quietly excluding a directory nothing generates any more.
    """
    repo = gate.REPO_ROOT
    manifest = repo / "docs" / "manifest.yaml"
    if not manifest.is_file():  # pragma: no cover - the manifest is committed
        pytest.skip("no documentation manifest in this tree")

    stems = sorted(
        path.stem
        for path in (repo / "docs" / "adr").glob("*.md")
        if gate.RECORD_STEM.match(path.stem)
    )
    assert stems, "the repository has no decision records, so the exclusion rests on nothing"

    root = tmp_path / "build"
    (root / "glossary").mkdir(parents=True)
    (root / "glossary" / "index.html").write_text(glossary_html(ALL_ANCHORS), encoding="utf-8")
    area = root / "decisions" / "adr"
    area.mkdir(parents=True)
    area.joinpath("index.html").write_text(page("<p>Nothing.</p>"), encoding="utf-8")
    for stem in stems:
        (area / stem).mkdir()
        (area / stem / "index.html").write_text(page("<p>Nothing.</p>"), encoding="utf-8")

    excluded = gate.generated_record_pages(root, manifest, repo).paths

    assert excluded == {"decisions/adr/index.html"} | {
        f"decisions/adr/{stem}/index.html" for stem in stems
    }


# --- a declared phrase that governs the rest of the page ------------------------------


def test_only_the_terms_argued_for_may_establish_another_sense() -> None:
    """The mechanism can hide a genuine use, so the list of terms using it is asserted.

    Adding a term here means arguing for it in the docstring and changing this test,
    which is the point: the alternative is a quiet second way to make a finding go away.
    """
    establishing = {term.anchor for term in gate.TERMS if term.establishes_other_sense}

    assert establishing == {"profile"}


def test_an_ordinary_excluded_phrase_establishes_nothing() -> None:
    """`front matter` excludes itself and no more; the control test above proves it."""
    front = next(term for term in gate.TERMS if term.anchor == "front")

    assert front.establishes_other_sense == ()
    assert "front matter" in front.excluded


def test_a_page_that_establishes_the_other_sense_is_not_checked_after_it(
    site: Path, capsys
) -> None:
    write(
        site,
        "<p>Compose profiles decide what starts. Adding its profile is a line, and the "
        "active profile list is generated.</p>",
    )

    code, _ = run(site, capsys)

    assert code == 0


def test_what_the_other_sense_hid_is_printed_on_every_run(site: Path, capsys) -> None:
    """Its blind spot is a debt, not an exemption, so the run names the page and phrase."""
    write(site, "<p>Compose profiles decide what starts. Adding its profile is a line.</p>")

    _, lines = run(site, capsys)

    printed = [line for line in lines if gate.OTHER_SENSE in line]
    assert len(printed) == 1
    assert "topic/index.html" in printed[0]
    assert "compose profiles" in printed[0]


def test_a_page_that_never_says_the_other_sense_is_checked_as_before(site: Path, capsys) -> None:
    """The seeded violation for the mechanism: remove the establishing phrase, and the
    same sentence is a finding again."""
    write(site, "<p>Adding its profile is a line, and the active profile list follows.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert any(gate.UNLINKED in line and "profile" in line for line in lines)


def test_a_use_before_the_establishing_phrase_is_still_a_finding(site: Path, capsys) -> None:
    """It governs what follows it and nothing before it, so a page cannot be cleared by
    mentioning the other sense at the bottom."""
    write(site, "<p>A vertical profile finds it. Compose profiles decide what starts.</p>")

    code, lines = run(site, capsys)

    assert code == 1
    assert any(gate.UNLINKED in line and "profile" in line for line in lines)


def test_the_other_sense_is_not_reported_when_it_hid_nothing(site: Path, capsys) -> None:
    """A page that says `compose profile` once and never abbreviates has no debt, and a
    line printed about it would train a reader to skip the ones that matter."""
    write(site, "<p>Compose profiles decide which services start.</p>")

    _, lines = run(site, capsys)

    assert not any(gate.OTHER_SENSE in line for line in lines)
