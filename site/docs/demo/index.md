---
title: The demo
description: The running harness, the current build of the default branch, and the per-branch instances published for review.
order: 10
---

# The demo

drogna builds to static assets and runs entirely in the page. There is no server to
provision, no account, and nothing to install: the demo is a URL.

[**Open the current build**](../instances/main/) — built from the default branch, at
its latest commit.

Every visit provisions a fresh seeded run. Nothing persists between visits, which is
deliberate: a harness that accumulated state between demonstrations would stop being
reproducible, and reproducibility is the only reason to trust anything it shows. Export
and import of a run manifest is how a particular run is replayed.

## Opening it at a particular view

The shell's views are addressable, so a link can open the page at the thing being
discussed rather than at the front door. Append `#/view/<id>` to any instance URL:

| View | Address | What it shows |
|---|---|---|
| Intro | [`#/view/intro`](../instances/main/#/view/intro) | What the harness is, and what its numbers are not |
| System | [`#/view/system`](../instances/main/#/view/system) | The components, lit by the heartbeats they are actually sending |
| Holdings | [`#/view/holdings`](../instances/main/#/view/holdings) | The coverage holdings, and the eras they span |
| Map | [`#/view/map`](../instances/main/#/view/map) | The field, the doubt over it, and the route chosen through it |
| Messages | [`#/view/messages`](../instances/main/#/view/messages) | The traffic on the broker, as it crosses |
| Operator | [`#/view/operator`](../instances/main/#/view/operator) | The machinery interrogated from the operator's side |

Activating a view writes the address back, so the address bar always names what is on
screen and a link can be copied out of it.

## Instances under review

Every branch that CI builds is published as its own instance and **kept after its pull
request completes**. A review comment can therefore link a specific build at a specific
view, and the link still resolves a year later — which is the point: a comment that
says "see the map panel" is worth less than one that opens it.

[**The instance index**](../instances/) lists every instance the estate holds, with the
commit each was built from. The addresses are stable and predictable:

```text
instances/main/                  the default branch
instances/<branch-with-slashes-as-hyphens>/   any other branch CI has built
```

A branch named `claude/website-v2-redesign-tqrtn0` is published at
`instances/claude-website-v2-redesign-tqrtn0/`.

Instances are grown into the estate additively: a deployment replaces its own subtree
and touches nothing else. Nothing is rebuilt wholesale at a merge, because a review
instance cannot wait for one.

## What it is not

The numbers are invented. The forecast is [advection](../glossary.md#advection) plus
noise. The sensors sample a generator, not an ocean. Everything the demo shows about
*how the parts fit together* is real; nothing it shows about the sea is.
