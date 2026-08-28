# A deliberate control for link validation

`mkdocs.yml` and `docs/` are a miniature site that is **wrong on purpose**: five broken
internal links, one per validation rule the real site raises to an error.

It exists because 015 T024 asked for `site/gates/check_links.py` — a second link checker —
and that is not the right way to close it. The property is already held, by
`mkdocs build --strict` with `validation` raised so that an omitted file, an absolute link,
an unrecognised link or a dangling anchor is an error. A second implementation would be a
second authority over one property, which is the drift `docs/manifest.yaml` already declines
when it refuses to restate the per-image size cap: two numbers for one bound is what this
repository keeps paying for.

What was genuinely missing was not coverage but **evidence**. Nobody had watched `--strict`
reject anything. A `validation:` block quietly relaxed to `ignore`, or a `--strict` dropped
from a workflow, would have left every build green and every broken link published, and no
test anywhere would have noticed. This fixture is what makes the real build's clean result
mean something.

`site/gates/tests/test_link_validation.py` builds it and expects a non-zero exit naming each
fault, then builds a corrected copy and expects success — because a checker that rejects
everything is no more use than one that rejects nothing.

## The five faults

| Where | What is wrong | Which rule reports it |
|---|---|---|
| `docs/index.md` | a link to a page that does not exist | `unrecognized_links` |
| `docs/index.md` | a link to a repository file that is not published | `unrecognized_links` |
| `docs/index.md` | a link to an anchor that is not on the page it names | `anchors` |
| `docs/index.md` | an absolute link | `absolute_links` |
| `docs/unpublished.md` | a page in `docs/` and absent from the navigation | `omitted_files` |

The second is the case T024 names in its own text, and it is the one a reader is most
likely to write by hand: a relative path out of the documentation tree into the repository,
which resolves perfectly well in an editor and not at all on the published site.

## What the fixture must keep

**Its `validation:` block must stay identical to `site/mkdocs.yml`'s.** The test reads both
and fails if they differ. Without that, relaxing the real site's validation would leave this
control still passing — proving that the settings it no longer uses would have worked.
