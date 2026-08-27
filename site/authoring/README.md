# Writing a blog entry

These two files are for authors, and they live outside `site/docs/` on purpose: anything
under `site/docs/blog/` is picked up by the blog plugin and published as an entry, and a
template published as an entry is an entry about nothing. Copy
`blog-entry-template.md` into `site/docs/blog/posts/<slug>.md` and write over it.

## Who you are writing for

A general technical reader who has not read the requirements document, has no reason to
care about oceanography, and arrived at this one entry from somewhere else rather than
by working through the site. Assume nothing carried over from another entry. A term that
needs it links to the glossary the first time it appears — the reader of an entry is
assumed to know less than the reader of the subsystem reference, because they did not
choose the subject.

Do not name a specification, a task number or a requirement identifier as if the reader
could look it up. Say what the requirement asked for instead.

## Problem before solution

Every entry that works here opens the same way: two or three paragraphs on the problem,
in terms someone outside the project would recognise, before anything is built or fixed.
"How much is an hour-old temperature measurement worth?" is a problem. "The generator
needed a decorrelation timescale field" is a solution, and it means nothing to a reader
who has not been told the first sentence.

The `<!-- more -->` marker goes after that opening. Everything above it is the excerpt
the index page shows, so the excerpt has to be the problem and not the preamble.

## State the learning plainly, including what did not work

The last section of an entry says what is now known that was not known before, in one or
two sentences, without decoration. The most useful entries here are the ones that report
a wrong turning: a check that passed because it was examining nothing, a test that
isolated nothing, a comparison that could not fail. If the first attempt was wrong, the
entry says so and says what the wrongness looked like from the inside — that is the part
a reader cannot reconstruct and the part they came for.

An entry that reports only success is a press release. If nothing went wrong, the
feature was probably not worth an entry.

## The front matter contract

`site/gates/check_blog.py` enforces this, and it is watched failing on each rule:

| Key | Rule |
|---|---|
| `date` | The date the entry was published. |
| `slug` | The entry's URL; it is also the filename. |
| `feature` | `specs/<directory>`, and the directory must exist. |
| `categories` | One of the categories `site/mkdocs.yml` allows. |
| `description` | One or two sentences; it is what the index and the search result show. |

## Screenshots

Every entry references at least one committed screenshot, which is the evidence that the
feature works rather than the claim that it does. Images live in
`site/docs/blog/assets/`, named `<feature-number>-<slug>.png`, and each carries a
`.provenance.json` sidecar beside it recording the seed, the viewport, the browser and
what the clock was doing. Images come only from the curated capture mechanism in
`scripts/capture/curate/`; a screenshot taken any other way is not reproducible and does
not go on the site.

The alt text is a description of what is in the picture, long enough to stand in for it
— read one of the existing entries for the length that means.
