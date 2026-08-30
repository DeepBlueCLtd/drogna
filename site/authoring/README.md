# Writing a blog entry

These two files are for authors, and they live outside `site/docs/` on purpose: anything
under `site/docs/blog/posts/` is published as an entry, and a template published as an
entry is an entry about nothing. Copy `blog-entry-template.md` into
`site/docs/blog/posts/<slug>.md` and write over it.

An entry is written when a **significant component** arrives — a new face in the shell,
or a piece of backend simulation worth watching work — not one per feature (D17). It
takes the fixed shape D19 sets, and the fourth part is the one that carries the weight:

1. **The background** — what was there before.
2. **The requirement** — what had to become true.
3. **The options considered** — and why the one chosen won.
4. **The demo** — the running thing. Where the work is visible, embed an instance of the
   shell opened at the relevant view. Where it is headless, embed a small page that
   reads the component through the seam and exercises it across its range; the wire
   shape is what makes such a page an ordinary consumer rather than a special build.

The entry is written in the pull request that delivers the component, not afterwards.
Afterwards is how V2 reached feature 111 with the estate publishing instances, the
template and this note in place, and no entries at all: nothing was refused, the moment
simply passed each time and the reason it was worth writing about went with it. The
pull request template asks for the entry or for the reason there is none, and the
coverage table on the blog index counts what exists against the feature directories
under `specs/`, so an unwritten entry is published as a gap rather than forgotten.

Terse, in other words. The advice below on *how* to write is unchanged from V1 and still
right; what has changed is how much of it there should be.

## Who you are writing for

A general technical reader who has not read the requirements document, has no reason to
care about oceanography, and arrived at this one entry from somewhere else rather than
by working through the site. Assume nothing carried over from another entry. A term that
needs it links to the glossary the first time it appears — the reader of an entry is
assumed to know less than the reader of the component reference, because they did not
choose the subject.

Do not name a specification, a task number or a requirement identifier as if the reader
could look it up. Say what the requirement asked for instead.

## Problem before solution

Every entry that works here opens the same way: two or three paragraphs on the problem,
in terms someone outside the project would recognise, before anything is built or fixed.
"How much is an hour-old temperature measurement worth?" is a problem. "The generator
needed a decorrelation timescale field" is a solution, and it means nothing to a reader
who has not been told the first sentence.

The `description` in the front matter is what the index shows beside the entry, so it
has to be the problem and not the preamble.

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

| Key | Rule |
|---|---|
| `title` | The entry's title. Without it the first heading is used. |
| `date` | The date the entry was published. It orders the index. |
| `feature` | `specs/<directory>`; the number in it is what the coverage table counts. |
| `description` | One or two sentences; it is what the index shows beside the entry. |

The filename is the entry's URL — `posts/<slug>.md` is published at `posts/<slug>/` —
so there is no `slug` key to keep in step with it and nothing that can disagree.

An entry whose `feature` names a directory that does not exist simply fails to appear
in the coverage table's row for it, which is visible on the page: the table is counted
from the feature directories under `specs/` and from each entry's own front matter, so
a mistyped feature shows up as a beat with no entry.

## Show it

Every entry references at least one committed capture, which is the evidence that the
feature works rather than the claim that it does. Captures live in
`site/docs/blog/assets/`, named `<feature-number>-<slug>.png` or `.gif`, and each carries
a `.provenance.json` sidecar beside it recording the run, the viewport, the browser and
what the clock was doing. They come only from the capture mechanism under
`scripts/capture/`; an image made any other way is not reproducible and does not go on
the site.

**A moving change is captured moving.** A card that grows, a chart that reflows, a lane
that pulses: a still of the end state is a picture of something else, and no wording
recovers what the reader did not see happen. `pnpm capture:motion` records a burst of
frames across one interaction and writes a GIF and its sidecar; `pnpm capture:glance`
does the same for one moment, and takes `DROGNA_GLANCE_VIEWPORT=390x844` for the narrow
presentation. Both drive the committed build with the clock pinned, so what moves in the
picture is the thing being shown and not the simulation underneath it.

**The instance link does not discharge this**, and the reason is who is reading. A pull
request is read by a reviewer with the branch in front of them, who will click a link to
a running instance and should be given one. An entry is read by somebody who arrived from
somewhere else, is not going to open a build of an application they do not use, and will
be reading it after that instance has been replaced. For them, the capture *is* the
evidence. Link the instance as well — it is the stronger thing for anyone who does click
— but the entry has to work without it.

This rule is older than the entries that keep it: seven of the first eleven have no
capture at all, which is what a rule with nothing counting it is worth. The coverage
table on the blog index now says of each beat whether it is **shown** or **told only**,
for the same reason it says which beats have no entry.

The alt text is a description of what is in the picture, long enough to stand in for it
— read one of the existing entries for the length that means.

## How long

**About 500 words, and 1000 is long.** The running thing carries the weight the prose
used to; every part below is one or two paragraphs, and the entry is finished when the
four of them are said, not when the subject is exhausted.

The failure this guards against is not padding. It is an entry written by somebody who
has just done the work and finds all of it interesting: the wrong turnings, the tests
that were planted, the second thing found while fixing the first. Almost none of that
belongs here — it belongs in the tasks file and the commit message, which is where the
next engineer looks for it. One wrong turning, chosen because a reader outside the
project would recognise the mistake, is worth more than five they would not.
