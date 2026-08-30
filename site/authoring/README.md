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

## How long

Three to six tweets. The entry is an invitation to the demo, and the demo is one click
away carrying the weight the prose would otherwise carry — so the prose says what a
reader needs in order to want to open it, and stops.

| Part | Words |
|---|---|
| prose — everything after the front matter, code, alt text and URLs not counted | 300 |
| description — the front matter line the index shows | 50 |

`check-blog-length` reads those two numbers out of this table and holds every entry in
`site/docs/blog/posts/` to them. It is a gate rather than a note because this note and
the template have both said *terse* since before the first entry existed, and the first
ten entries came in at 576 to 2,088 words anyway. A length that is only advice is advice
read once the writing is done.

There is no exemption marker. An entry that will not fit is two entries, or an entry
whose middle is a decision record and belongs in `docs/adr/`.

That budget is roughly 70 words a part, which is two or three sentences. What survives
the cut is the finding — the thing that was not known before, and what the wrong turning
looked like from the inside. What goes is the recap: the reader does not need the system
explained before the problem, and every sentence explaining what the demo will show is a
sentence spent instead of the demo.

## The rest of the shape

The entry is linked from that pull request by its full URL on the branch —
`https://github.com/DeepBlueCLtd/drogna/blob/<branch>/site/docs/blog/posts/<slug>.md` —
not by its path in the tree, which GitHub resolves against the page the body is read on
rather than against the repository, and so answers 404. After the branch merges the
entry is published at `https://deepbluecltd.github.io/drogna/blog/posts/<slug>/`.

The entry is written in the pull request that delivers the component, not afterwards.
Afterwards is how V2 reached feature 111 with the estate publishing instances, the
template and this note in place, and no entries at all: nothing was refused, the moment
simply passed each time and the reason it was worth writing about went with it. The
pull request template asks for the entry or for the reason there is none, and the
coverage table on the blog index counts what exists against the feature directories
under `specs/`, so an unwritten entry is published as a gap rather than forgotten.

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

Every entry that works here opens the same way: the problem, in terms someone outside the
project would recognise, before anything is built or fixed. "How much is an hour-old
temperature measurement worth?" is a problem. "The generator needed a decorrelation
timescale field" is a solution, and it means nothing to a reader who has not been told
the first sentence. At this length that opening is a short paragraph, not three — say
what was wrong and why the obvious answer does not work, and go on.

The `description` in the front matter is what the index shows beside the entry, so it
has to be the problem and not the preamble.

## State the learning plainly, including what did not work

The finding goes in the title and in the description, where a reader meets it before
deciding to read on; the entry then earns it. The most useful entries here are the ones
that report a wrong turning: a check that passed because it was examining nothing, a test
that isolated nothing, a comparison that could not fail. If the first attempt was wrong,
the entry says so and says what the wrongness looked like from the inside — that is the
part a reader cannot reconstruct and the part they came for, and at 300 words it is what
the budget is for rather than a paragraph competing for it.

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

Every entry carries at least one committed capture, which is the evidence that the
feature works rather than the claim that it does. **A moving change is captured moving**:
a card that grows, a chart that reflows, a lane that pulses — a still of the end state is
a picture of something else, and no wording recovers what the reader did not see happen.
`pnpm capture:motion` records a burst of frames across one interaction and writes a GIF
with its sidecar; `pnpm capture:glance` does the same for one moment, and takes
`DROGNA_GLANCE_VIEWPORT=390x844` for the narrow presentation.

**The instance link does not discharge that**, and the reason is who is reading. A pull
request is read by a reviewer with the branch in front of them, who will click a link to
a running instance and should be given one. An entry is read by somebody who arrived from
elsewhere, will not open a build of an application they do not use, and is reading after
that instance has been replaced. Link the instance as well — it is the system rather than
a picture of it — but the entry has to work without it.

This rule is older than the entries that keep it: seven of the first eleven have no
capture at all, which is what a rule with nothing counting it is worth. The coverage
table on the blog index now says of each beat whether it is **shown** or **told only**,
for the same reason it says which beats have no entry.

Images live in `site/docs/blog/assets/`, named `<feature-number>-<slug>.png` or `.gif`, and each
carries a `.provenance.json` sidecar beside it recording the seed, the viewport, the
browser and what the clock was doing. Images come only from the capture mechanism under
`scripts/capture/`; a screenshot taken any other way is not reproducible and does not go
on the site.

The alt text is a description of what is in the picture, long enough to stand in for it.
It does not count against the word budget, and it is the one place in an entry where
length is a virtue: a reader who cannot see the picture should lose nothing.
