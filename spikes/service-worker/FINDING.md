# Finding: the service worker answers, and the first visit is the whole problem

**The question.** The browser-twin spike closed the control half of the client's seam and
left the HTTP half open (F6 there). Can a service worker serve the query layer and the
clock's HTTP interface to the client, from a static deployment with no backend, reliably
enough to build a feature on?

**The answer.** Yes. Every mechanism it needed works, including the ones that looked
riskiest. What it does not do is remove a race — a first visit has a window in which there
is no query layer — and the fix for that changes the sequencing FR-019 pins. That is a
design consequence to accept knowingly, not a defect to work around.

---

## What was proved, and how to see it

`./run.sh` serves a tree laid out as a per-pull-request preview would be, grafts the specs
into `client/e2e/spike/`, drives Chromium with Playwright, plants a fixed delay and watches
the repository's own gate catch it, then restores everything.

```
worker specs (scope, race, wire, blocked):  PASS   (9 specs)
specs typecheck:                            PASS   (as part of client/e2e)
fixed-sleep gate over the specs:            PASS
fixed-sleep gate, delay planted:             CAUGHT
fixed-sleep gate, delay removed:            PASS
```

`http://127.0.0.1` is a secure context by definition, so none of this needed a
certificate. What that cannot prove is GitHub Pages itself. Each finding below says which
it is: a **platform rule**, which holds identically wherever the files are served from, or
an **observation**, which held on this browser on this machine.

## G1 — Scope is the directory, and that is what makes one preview per pull request work

*Platform rule, and the one that matters most for F11 of the browser-twin spike.*

A worker registered from `/drogna/pr/17/sw.js` gets the scope `/drogna/pr/17/` and can
answer for nothing above it. The specs assert the complement directly: after registering
17's worker, a page at `/drogna/pr/18/` is uncontrolled and its query path 404s from the
server, and so does the site root. Two previews cannot interfere, and neither can reach the
published documentation.

This is a rule of the platform rather than a convention, so it needs no enforcement and no
gate. It also means a preview needs no coordination with any other: the worker ships inside
the directory it serves, and the directory is the boundary.

## G2 — The responses are real, and Playwright says so independently

*Observation, on Chromium 1194.*

`response.fromServiceWorker()` is true for the query and clock calls and false for the
bootstrap document and the page's own script — Playwright's attribution, not the
`x-served-by` header the spike added for the page to read. Both agree. A reader with the
network panel open sees genuine `GET`s with genuine status codes, which is the whole reason
to prefer a worker to an in-page handler: an in-page handler returns the same values and
shows nothing, which is the difference between demonstrating a standard and asserting one.

The refusals are real too. A collection the preview does not carry is a `404` with an
error body, a trajectory outside the published extent is a `400` naming how many vertices
were outside, and a `coords` parameter that is not a `LINESTRING ZM` is a `400`. That is
F7 of the browser-twin spike made concrete: a committed field slice has a fixed extent, and
outside it the honest answer is an error rather than a plausible number.

## G3 — The first visit races, and the bootstrap document is what saves it

*Platform rule for the race; observation for how it closed.*

A page that registers a worker is not controlled by it. The specs assert this rather than
assuming it: `controlledAtLoad` is false, and a fetch issued before registration reaches
the server and 404s. A second visit is controlled from its very first request, and the same
fetch is answered by the worker. So the window exists exactly once per visitor, and a
preview link is always a first visit.

**The mitigation is not to serve the bootstrap document from the worker.** It is a static
file on the origin, and the specs confirm it arrives from the server with
`fromServiceWorker()` false. This matters more than it looks: the client's whole startup
depends on that document, and a document that could only arrive after the worker was
controlling would put the race on the critical path of every page load. Keeping it static
means the only calls that need the worker are the query and the clock — and in a twin those
happen after a run has been announced on the control namespace, which is a component's
message and therefore already later than any registration.

What the page must still do is wait for the worker to be **controlling**, not merely
*ready*. `navigator.serviceWorker.ready` resolves on an active registration;
`clients.claim()` taking over an already-loaded page is a separate step. This run observed
the controller already set by the time `ready` resolved, so the extra wait was a no-op —
but that is a timing detail rather than a guarantee, and the spec deliberately does **not**
assert which of the two paths it took. Asserting it would be asserting a coincidence: a
test that passes on this machine and fails on a slower one. The page handles both and waits
on neither a duration nor a specific ordering.

The cost: FR-019 pins the startup sequence as fetch the document, validate it, and only
then open a transport. A worker-backed deployment inserts one step — become controlled —
before the calls that the worker answers, though not before the document. That is a change
to a sequencing requirement and should be recorded as one.

## G4 — A browser that will not run a worker says so, rather than appearing to work

*Observation, via Playwright's `serviceWorkers: "block"` context option.*

With workers blocked, `register()` rejects, the page records `unavailable` with the reason,
and — the part that mattered — it does **not** hang waiting for a controller that is never
coming. It reports that it has no query layer.

This is the same failure PR #15 described from the other end: a client whose configuration
points somewhere unreachable is, under Constitution VII, correct and indistinguishable from
a healthy client in front of a dead backend. A preview must not reproduce that. The page
that ships needs to say "this browser will not run the component that answers queries"
where a viewer will read it, in the same register as the honesty banner.

## G5 — Every wait is on a condition, and the gate that says so now sees the file

*Finding about the gates, discovered by the gate reporting clean on a directory it was
refusing to read.*

The first attempt pointed `scripts/check_no_fixed_sleep.py` at `spikes/service-worker/proof`
and got `fixed-sleep: clean.` both before and after planting a `waitForTimeout`. The gate
was right and the exercise was worthless: `spikes` is in `SHARED_EXCLUSIONS` in
`scripts/_gate_lib.py`, so a walk of that directory yields no files at all. A check that has
never been seen to fail is worth nothing, and this is precisely the shape one takes.

The fix is the reason the specs are grafted into `client/e2e/spike/` rather than run where
they sit: `client/e2e` is one of the two directories the gate is about, so the graft is
covered by the ordinary run with no argument. Planted there, the violation is caught and
named with its file and line, and the gate goes green when it is removed.

**Carry this into the feature.** A capture path that lives outside `client/e2e/` or
`scripts/capture/` is not covered by that gate, and its absence looks exactly like
compliance.

## G6 — What this did not prove

- **GitHub Pages itself.** Scope, claiming, and blocked-worker behaviour are platform rules
  and hold identically; what is untested is Pages' own headers and caching. A worker is
  served with whatever cache policy Pages applies, and a stale `sw.js` is the classic way a
  preview shows yesterday's answers. The feature should set an explicit cache policy for
  the worker and verify it against the real host once, which is a ten-minute check against
  a published preview and cannot be done from here without overwriting the site.
- **The real client.** These specs drive a page that makes the calls the client makes, not
  the client itself. That is deliberate — the client has no twin to talk to yet, so driving
  it would have proved the twin rather than the worker — but it means the FR-019 sequencing
  change in G3 is described rather than exercised.
- **Concurrency with the twin's components.** The worker answers HTTP; the twin's components
  publish on a `BroadcastChannel`. Both work; that they compose under load is untested.

## What this changes in the browser-twin recommendation

Stage two was conditional on this spike. It is no longer conditional: the mechanism works,
the risks named in F6 are answered, and the two that remain (G6) are verification tasks
rather than unknowns.

The staging can therefore be relaxed, and the reason to keep it is now different. Stage one
still comes first because the twin's components are what a preview has to show; the worker
adds the standards story on top of a page that already lights up. But there is no longer a
case for stopping after stage one.

One item moves earlier: the honesty message in G4 belongs with stage one's provenance work
rather than with stage two, because a preview whose worker is blocked should say so
whether or not it has a query layer to lose.

## Cost

| Piece | Shape |
|---|---|
| The worker, at contract fidelity over a committed field slice | The bulk. The routing is trivial; conforming to EDR is not. |
| Bootstrap-stays-static, and the controlled-not-merely-ready wait | Small, and proven here. Wants an FR-019 amendment recorded. |
| The blocked-worker message | Small, and belongs to stage one. |
| Cache policy for `sw.js`, verified against a real preview | Half a day, and cannot be done before there is a preview. |

## Recommendation

Build it, after stage one, without a stop point between them. Record the FR-019 sequencing
change as an amendment rather than folding it in silently, and put G4's message into stage
one where it belongs.
