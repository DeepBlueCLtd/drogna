---
date: 2026-08-27 12:00:00
categories:
  - Process
slug: two-ways-to-compare-nothing
feature: specs/016-visual-capture
description: >-
  A screenshot comparison is only evidence if two captures of an unchanging page
  come back identical. Showing that the check can fail took two sabotages, and
  they failed in two different places, which turns out to be the whole point.
---

# Two ways to compare nothing

drogna takes screenshots of its browser client for three different reasons, and there
are three separate tools to take them. The one that matters here compares a picture of
the client before a change with a picture after it, and reports the difference. That
report is only worth reading if a pair captured across *no* change comes back empty.

<!-- more -->

<figure markdown="span">
![The top of the component shell: a heading, a line reading 0 of 18 components heard from within the window each declared, and three panels reporting that no time sample has arrived, that the page is not connected to the broker, and that nothing has been heard from under an id the drawing does not know. Below them the component flow chart begins: two full rows of ten boxes — environment generator, simulated sensors, ingest client, monitor, scheduler, simulation clock, broker, observation store, publisher, model runner — every one of them grey and labelled NOT HEARD FROM, with the monitor-scheduler-model-runner-publisher loop drawn between them. A third row — browser client, drawn with a dashed outline, reverse proxy, query layer, coverage store — is cut off by the lower edge of the frame.](../assets/003-shell-all-dark.png)
<figcaption>A curated capture: the fixed blog viewport, no browser chrome, and a
provenance record beside it giving the seed, the simulated instant, the viewport, the
scale factor and the browser build.</figcaption>
</figure>

The property is one sentence — *two captures of a pinned state are identical* — and
everything else rests on it. If a no-change pair produces a non-empty difference, then
a pair captured across a real change produces a difference containing the real change
**and** whatever noise made the no-change pair non-empty, and there is no way to tell
those apart by looking at the picture. A comparison whose no-change answer is not empty
has no business being trusted with a change.

So there is a test that captures the same view twice, three times over, and asserts
each difference is empty. And that test, on its own, is worth nothing at all, because
`expect(a).toEqual(a)` passes too.

## The first sabotage: a comparison that cannot fail

The obvious way for the property to be vacuous is for the comparison to be incapable of
reporting a difference. A broken image decoder, a threshold set so high that nothing
clears it, a diff function that returns zero because of an early return nobody noticed —
all of them look exactly like a page that is beautifully deterministic.

The control for that is committed alongside the test. After the three clean runs, it
puts a host-derived elapsed display on the page — a paragraph that rewrites itself with
`performance.now()` on every animation frame — and asserts that the comparison notices:

```ts
expect(
  outcome.differingPixels,
  "the comparison did not notice a display that changes every animation frame. That " +
    "means it is not comparing what it claims to compare, and every empty difference " +
    "it has ever reported is worth nothing.",
).toBeGreaterThan(pairSettings.maximum_differing_pixels);
```

Then it asserts the difference has a *bounding box*, and that the box sits inside the
perturbing element's own rectangle. A pixel count alone cannot distinguish one changed
element from noise scattered over the whole page, and "the difference is confined to
the component that changed" is a claim the mechanism makes elsewhere.

Then it reloads, checks the perturbation is gone, and asserts the empty property holds
again — so that the failure above is demonstrably caused by the perturbation rather than
by something that happened to coincide with it.

Neutering the comparison to always return zero is how you check the control itself, and
the result is the part worth keeping. The three clean runs go on passing — of course they
do; a comparison that always answers zero answers zero for them too — and only the
control goes red, with that message. Half the file was vacuous and looked healthy, and
the only thing that could tell you so was the half that had been given something it had
to catch.

## The second sabotage: a comparison that never gets to look

The other way is less obvious, and it is the one that produced the more interesting
failure. Leave the frame-by-frame ticker running and take the pair the way a real
capture would take it — through the readiness signal.

The comparison never runs. Readiness refuses first:

```
the client at http://127.0.0.1:8080 never settled: its markup changed 900 times in
900 animation frames and never held still for 12 consecutive frames. Something on the
page is redrawing with different content every frame; a capture taken now would differ
from the next one for reasons that have nothing to do with any change under evidence.
```

Both sabotages break the property. They break it in different places, and if you only
knew that "the test went red" you would draw the wrong conclusion from one of them. A
comparison that cannot fail and a comparison that never gets to look are different
vacuities: the first means every empty difference ever reported was meaningless, and the
second means the page was never in a state worth photographing. Only one of them is a
bug in the capture tooling.

The control in the repository therefore deliberately skips the readiness wait for its
perturbed captures, with the reason written down where the skip is: waiting for markup
to hold still is exactly what the perturbation makes impossible, and that timeout is a
different — and also correct — failure. What is under test there is the comparison, so
the comparison is what it is allowed to reach.

## Feature 012 had to delete code for any of this to be possible

The frame-by-frame ticker is not an invented perturbation. It is a copy of something the
client used to render. Feature 012 removed it, and left the reason in the file where it
had been:

```ts
/*
 * There was a `secondsWords` here, turning a host duration into "12 s ago" for the boxes
 * and the clock panel. Feature 012's FR-009 removed it and the three places that called
 * it. Host time may drive illumination and nothing else: a figure counting upwards makes
 * the rendered output differ from one frame to the next, so two captures of the same
 * state at a pinned rate could never be identical (SC-009), and the pin is the whole
 * point of FR-53. Whether a component is still believed is said by its illumination, and
 * whether the clock is still speaking is said by the four-state clock display. Neither
 * needs a number, and the number was the only thing making the page restless.
 */
```

"12 s ago" is a small, friendly, entirely reasonable thing to put next to a component
box. It also meant that a pinned frame differed from itself, and therefore that no
screenshot of this client could ever be evidence of anything. The capability was
subtracted rather than added, which is a shape of work that is easy to skip and hard to
notice the absence of. The control described above is now the standing guard against
somebody putting it back for the best of reasons.

## Readiness is three application signals and never a delay

The temptation, when a page is not ready, is to wait a second. A fixed sleep fails in
three ways of ascending unpleasantness: it makes a fast machine wait for nothing, it
makes a slow machine fail, and — the reason it is a build gate here — on a machine that
is slow only sometimes it *succeeds*, by photographing a half-drawn page. Nothing goes
red. The picture is simply wrong, and nobody finds out until it is on a blog.

So every wait is on something the application itself produced. The component layout is
in the document, which says the page has run rather than that it has heard anything. The
fonts have loaded, which is the browser saying no further reflow is coming from a font
arriving late. And the markup has stopped changing.

That third one is counted in frames, not seconds: twelve consecutive animation frames
rendering identical markup is the settled signal, and nine hundred frames is the bound
on the watch. The settle check reads no clock of any kind, which is the point — a bound
expressed in seconds would be the sleep the module exists to avoid, wearing yet another
hat. It is also where the nine hundred in that error message comes from.

The prohibition is a gate, `scripts/check_no_fixed_sleep.py`, registered as a line in
`scripts/gates.registry` like every other. It scans two directories rather than the whole
tree, and it scans the test files inside them too — those files *are* the capture paths,
so exempting them by path would exempt exactly the code that needs checking.

## Three tools, no shared plumbing

The three mechanisms answer three questions. *What does it look like now?* — an agent,
mid-session, output thrown away. *What did this change do?* — CI, on a pull request,
kept for the life of the branch. *What should the blog show?* — a person, after the
feature works, kept for ever.

The instinct on seeing three similar scripts is to merge them behind one command with a
`--mode` flag, and the reasons not to are written down for whoever has that instinct
next. Only one of the three is a comparison, and it needs the clock pinned; the
in-session glance must *not* pin, because it exists to show the system as it actually is,
including the runaway loop the author is trying to see. A single mechanism cannot both
pin and not pin. Only one has a review gate, and an optional gate on a public artefact
is not a gate.

An argument in a document is not a constraint, so there is a test as well. It asserts
that no entry point imports another, that the three output areas are disjoint, that only
the curated area is tracked by git — and that nothing in the one module they *do* share
names a glance, a pair or a curated shot. The shared module holds selectors and page
objects: knowing that the component layout is `[data-testid="component-diagram"]` is a
fact about the client, whereas deciding whether to pin the clock before photographing it
is policy. A narrow sharing point stays narrow by being unable to name the things
sharing it, because a lookup by a name the caller supplies cannot grow a branch per
mechanism, and a branch per mechanism is what policy looks like when it leaks.

That test has its own control, for the same reason everything else here does: run over a
tree where nothing has ever crossed, a separation check that reads no imports at all
passes. So the same check is run over a deliberately merged fixture tree, in which the
glance imports the pair's clock pinning, and is asserted to reject it and to name the
offending import.

## The scrubber refused the shot it was there to protect

Every published image gets a provenance record beside it: the seed, the simulated
instant, the viewport, the device scale factor, the browser build, the version of the
capture procedure. Enough to take the shot again a year later, on a different machine.

That file is also a text file next to a public image, which is exactly the kind of file
that quietly carries somebody's home directory or a deployment hostname. So the record
is assembled from a fixed list of fields rather than from whatever the caller happened
to have, and it is checked against the shapes that leak — an absolute path, a `~/`, a
URL, a bare `host:port`, an IPv4 address, a `USER=` — and *refused* rather than
redacted. A record that had to be redacted is a record whose author did not know what
was in it, and the next one will carry something the redactor has not been taught about.

The control cases for that check are the ones that caught the bug, and the bug was in
the check. `host:port` and an ISO 8601 simulation instant have the same shape. A
timestamp with an `hh:mm` in it reads as a hostname and a port to a pattern drawn
loosely enough, and the scrubber refused a perfectly clean record for containing the one
field it is required by specification to carry.

The fix is in the committed module twice over: the host-and-port pattern now has to
begin with a letter that is not itself preceded by a word character, which the client's
instants never satisfy, and `simTime` is additionally named as exempt from that one
pattern. Belt and braces, and worth saying plainly: with the pattern as it now stands
the exemption does not fire for any instant this client produces. It is the second line
of defence, kept because the shape of a timestamp is not this module's to control, and
because a pattern drawn around a shape catches other things with that shape. The
comment above the exemption list says there are exactly two exemptions and why — the
other is a four-part browser version, which reads as an IP address.

A check that cries wolf is a check somebody turns off. This one nearly did, on its first
real record, and the only reason anybody knows is that the test suite had a case for
each leaking shape *and* a case asserting the check does not simply refuse everything.

## A postscript, and the limit of it

The obvious way to end this entry would be to publish a second curated image beside the
one at the top, note that the two are byte-identical, and let the `sha256sum` speak. That
was written, and then it was cut, because the evidence does not support the claim as well
as it appears to.

Two files with one digest prove that the bytes are equal. They do not prove that the
bytes were *captured* twice. Nothing committed alongside them distinguishes two runs of
the mechanism hours apart from one run and a copy — and the reason is worth more than the
demonstration was.

A provenance sidecar records the seed, the simulation instant, the viewport, the device
scale factor, the entry point version, the browser build, whether the clock was pinned,
and which components were lit. It does not record when the capture happened, because
*when* here would mean host time, and reading the host clock is the one thing this project
does not do (Constitution I). The record deliberately cannot answer the question the
demonstration needed answered. So the second image is not in the repository; this entry
and [Eighteen boxes, none of them lit](eighteen-boxes-none-of-them-lit.md) share one
picture between them.

What is left is better, because anyone can run it:

```console
$ pnpm exec playwright test --config e2e/pair.config.ts determinism.spec.ts
  ✓ three captures of an unchanged page differ by nothing   [0, 0, 0]
  ✓ the comparison notices a display that changes every frame   1494
```

Three captures of the real client, differing by zero pixels, and a control proving the
comparison can still see. That is the property, stated where it can be checked rather
than inferred from a pair of files.

The reason both pictures are of a shell with nothing lit is that this environment has no
container runtime, so there is no broker and no clock service for the client to hear
from. Every capture taken so far has been of a system in which eighteen of eighteen
components are dark — which is a real state of a real system, and the one the earliest
entries here are pictures of, but it means one assertion in the pair mechanism has never
had anything to prove. Before it pins the clock it reads which components are lit, and
after pinning it checks they are all still lit; simulation time stops at rate zero and
liveness windows are real time, so nothing should go dark. That check has never fired,
because no capture has yet had a lit component to lose. It becomes load-bearing the
first time a pair is taken against a running stack.

Which is the honest version of the same sentence this whole entry keeps arriving at: a
check that has never had the opportunity to fail is not yet evidence of anything, and
the useful thing to write down is which of those you have.
